import { Account, connect, KeyPair, Near } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { nearAccountConfig, nearConnectionConfigs, nearNetworkId, nodeUrls } from '../configs/near.config';
import { LoggerService } from './logger.service';
import { deriveWorkerAccount } from '../utils/agent';
import { liquidityPoolContract, solverPoolId, solverRegistryContract } from 'src/configs/intents.config';
import { teeEnabled } from 'src/configs/tee.config';

export class NearService {
  private near!: Near;
  private keyStore!: KeyStore;
  private account!: Account;
  private publicKey: string | undefined;

  private viewers!: Account[];

  private logger = new LoggerService('near');

  public async init(): Promise<void> {
    this.logger.info(`Using Near RPC nodes: ${nodeUrls.join(', ')}`);
    this.near = await connect(nearConnectionConfigs[0]);
    this.keyStore = this.near.config.keyStore;

    if (teeEnabled) {
      if (!solverRegistryContract) {
        throw new Error('SOLVER_REGISTRY_CONTRACT is not defined');
      }
      if (!solverPoolId) {
        throw new Error('SOLVER_POOL_ID is not defined');
      }

      const { accountId, publicKey, secretKey: privateKey } = await deriveWorkerAccount();
      this.publicKey = publicKey;
      const keyPair = KeyPair.fromString(privateKey);
      await this.keyStore.setKey(nearNetworkId, accountId, keyPair);
      this.account = await this.near.account(accountId);

      // Configure viewers for cross-checking view function results from multiple NEAR RPC nodes
      this.viewers = await Promise.all(nearConnectionConfigs.map(async (config) => {
        const near = await connect(config);
        return near.account(accountId);
      }));
      if (this.viewers.length < 2) {
        throw new Error('Not enough NEAR RPC nodes to cross-check view function results');
      }
    } else {
      if (!nearAccountConfig.accountId) {
        throw new Error('NEAR_ACCOUNT_ID is not defined');
      }
      if (!nearAccountConfig.privateKey) {
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
   * Gets the NEAR balance of the account
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

  /**
   * Secure view function by cross-checking results from multiple NEAR RPC nodes
   * @param { contractId: string, methodName: string, args: object | undefined }
   * @returns validated view function result
   */
  public async secureViewFunction(
    { contractId, methodName, args }: { contractId: string, methodName: string, args?: object },
  ) {
    const results = await Promise.all(this.viewers.map(async (viewer) => {
      return viewer.viewFunction({
        contractId,
        methodName,
        args,
      });
    }));
    // deep compare the results
    if (results.every((result) => JSON.stringify(result) === JSON.stringify(results[0]))) {
      return results[0];
    }
    throw new Error('View function results mismatch');
  }
}
