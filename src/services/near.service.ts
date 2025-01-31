import { Account, connect, KeyPair, Near } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { nearAccountConfig, nearConnectionConfig, nearNetworkId } from '../configs/near.config';
import { LoggerService } from './logger.service';

export class NearService {
  private near!: Near;
  private keyStore!: KeyStore;
  private account!: Account;

  private logger = new LoggerService('near');

  public async init(): Promise<void> {
    this.logger.info(`Using Near RPC node: ${nearConnectionConfig.nodeUrl}`);
    this.near = await connect(nearConnectionConfig);
    this.keyStore = this.near.config.keyStore;

    const keyPair = KeyPair.fromString(nearAccountConfig.privateKey);
    await this.keyStore.setKey(nearNetworkId, nearAccountConfig.accountId, keyPair);
    this.account = await this.near.account(nearAccountConfig.accountId);
  }

  public getAccount(): Account {
    return this.account;
  }

  public getAccountId(): string {
    return this.account.accountId;
  }

  public async signMessage(message: Uint8Array) {
    return (await this.keyStore.getKey(nearNetworkId, this.getAccountId())).sign(message);
  }
}
