import { Account, connect, KeyPair, Near } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { nearAccountConfig, nearConnectionConfig, nearNetworkId } from '../configs/near.config';
import { LoggerService } from './logger.service';
import { deriveWorkerAccount } from '../utils/agent';
import { liquidityPoolContract } from 'src/configs/intents.config';
import { teeEnabled } from 'src/configs/tee.config';

export class NearService {
  private near!: Near;
  private keyStore!: KeyStore;
  private account!: Account;
  private publicKey: string | undefined;

  private logger = new LoggerService('near');

  public async init(): Promise<void> {
    this.logger.info(`Using Near RPC node: ${nearConnectionConfig.nodeUrl}`);
    this.near = await connect(nearConnectionConfig);
    this.keyStore = this.near.config.keyStore;

    if (teeEnabled) {
      const { accountId, publicKey, secretKey: privateKey } = await deriveWorkerAccount();
      this.publicKey = publicKey;
      const keyPair = KeyPair.fromString(privateKey);
      await this.keyStore.setKey(nearNetworkId, accountId, keyPair);
      this.account = await this.near.account(accountId);
    } else {
      if (!nearAccountConfig.privateKey) {
        throw new Error('NEAR_ACCOUNT_ID is not defined');
      }
      if (!nearAccountConfig.accountId) {
        throw new Error('NEAR_PRIVATE_KEY is not defined');
      }

      const keyPair = KeyPair.fromString(nearAccountConfig.privateKey);
      await this.keyStore.setKey(nearNetworkId, nearAccountConfig.accountId, keyPair);
      this.account = await this.near.account(nearAccountConfig.accountId);
    }
  }

  public getAccount(): Account {
    return this.account;
  }

  public getAccountId(): string {
    return this.account.accountId;
  }

  public getAccountPublicKey(): string {
    return this.publicKey ?? '';
  }

  public getIntentsAccountId(): string {
    if (teeEnabled) {
      // use liquidity pool contract as solver signer ID if TEE is enabled
      if (!liquidityPoolContract) {
        throw new Error('Liquidity pool contract is not defined');
      }
      return liquidityPoolContract;
    }
    return this.getAccountId();
  }

  public async signMessage(message: Uint8Array) {
    return (await this.keyStore.getKey(nearNetworkId, this.getAccountId())).sign(message);
  }

  /**
   * Gets the balance of the NEAR account
   * @returns {Promise<string>} Account balance
   */
  public async getBalance() {
    let balance = '0';
    try {
      const { available } = await this.account.getAccountBalance();
      balance = available;
    } catch (e: unknown) {
      if (e instanceof Error && 'type' in e && e.type === 'AccountDoesNotExist') {
        // this.logger.info(e.type);
      } else {
        this.logger.error(e instanceof Error ? e.toString() : String(e));
      }
    }
    return balance;
  }
}
