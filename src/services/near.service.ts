import { Account, connect, KeyPair, Near } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { nearConnectionConfig, nearNetworkId } from '../configs/near.config';
import { LoggerService } from './logger.service';
import { deriveWorkerAccount } from 'src/helper/agent';

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

  public getAccount(): Account {
    return this.account;
  }

  public getAccountId(): string {
    return this.account.accountId;
  }

  public getPublicKey(): string {
    return this.publicKey;
  }

  public async signMessage(message: Uint8Array) {
    return (await this.keyStore.getKey(nearNetworkId, this.getAccountId())).sign(message);
  }

  /**
   * Gets the balance of a NEAR account
   * @param {string} accountId - NEAR account ID
   * @returns {Promise<{available: string}>} Account balance
   */
  public async getBalance() {
    let balance = '0';
    try {
      const { available } = await this.account.getAccountBalance();
      balance = available;
    } catch (e: unknown) {
      if (e instanceof Error && 'type' in e && e.type === 'AccountDoesNotExist') {
        console.log(e.type);
      } else {
        throw e;
      }
    }
    return balance;
  }
}
