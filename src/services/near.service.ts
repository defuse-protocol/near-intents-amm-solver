import { Account, connect, KeyPair, Near } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { nearConnectionConfig, nearNetworkId } from '../configs/near.config';
import { LoggerService } from './logger.service';
import { deriveWorkerAccount } from '../utils/agent';
import { liquidityPoolVaultContract } from 'src/configs/intents.config';

export class NearService {
  private near!: Near;
  private keyStore!: KeyStore;
  private account!: Account;
  private publicKey!: string;

  private logger = new LoggerService('near');

  public async init(): Promise<void> {
    this.logger.info(`Using Near RPC node: ${nearConnectionConfig.nodeUrl}`);
    this.near = await connect(nearConnectionConfig);
    this.keyStore = this.near.config.keyStore;

    const { accountId, publicKey, secretKey: privateKey } = await deriveWorkerAccount();

    const keyPair = KeyPair.fromString(privateKey);
    await this.keyStore.setKey(nearNetworkId, accountId, keyPair);
    this.account = await this.near.account(accountId);
    this.publicKey = publicKey;
  }

  public getSigner(): Account {
    return this.account;
  }

  public getSignerId(): string {
    return this.account.accountId;
  }

  public getSignerPublicKey(): string {
    return this.publicKey;
  }

  public getLiquidityPoolVaultId(): string {
    return liquidityPoolVaultContract;
  }

  public async signMessage(message: Uint8Array) {
    return (await this.keyStore.getKey(nearNetworkId, this.getSignerId())).sign(message);
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
