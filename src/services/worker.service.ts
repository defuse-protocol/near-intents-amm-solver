import { NearService } from './near.service';
import { getPool, getWorkerPingTimeoutMs, pingRegistry, registerWorker, reportWorkerId } from 'src/utils/agent';
import { getWorker } from 'src/utils/agent';
import { sleep } from 'src/utils/sleep';
import { LoggerService } from './logger.service';
import { NEAR } from 'near-units';
import { solverPoolId } from 'src/configs/intents.config';
import { marginPercent } from 'src/configs/quoter.config';
import pRetry from 'p-retry';

export class WorkerService {
  public constructor(private readonly nearService: NearService) {}

  private logger = new LoggerService('worker');
  private pingTimeoutMs: number | undefined;

  public async init(): Promise<void> {
    await this.verifyPoolInfo();
    await this.reportAccountId();
    await this.registerSolverInRegistry();
    await this.queryPingTimeoutMs();
    await this.heartbeat();
  }

  private async verifyPoolInfo() {
    const pool = await getPool(this.nearService, Number(solverPoolId!));
    if (!pool) {
      throw new Error('Pool not found');
    }

    // Verify token IDs in pool
    const tokenIds = pool.token_ids;
    if (tokenIds.length !== 2) {
      throw new Error('The pool has invalid number of tokens');
    }
    const tokenIdsSet = new Set(tokenIds);
    if (
      !tokenIdsSet.has(process.env.AMM_TOKEN1_ID!) ||
      (!tokenIdsSet.has(process.env.AMM_TOKEN2_ID!) && process.env.AMM_TOKEN1_ID! === process.env.AMM_TOKEN2_ID!)
    ) {
      throw new Error('Pool has invalid token IDs');
    }
    this.logger.info(`The tokens in the pool: (${tokenIds.join(', ')})`);

    // Verify the fee of pool
    const fee = pool.fee;
    if (fee !== marginPercent * 100) {
      throw new Error(`Pool has invalid fee. Expected ${marginPercent}%, but got ${fee / 100}% from contract`);
    }
    this.logger.info(`The fee in the pool: ${fee / 100}%`);
  }

  private async reportAccountId() {
    const signer = this.nearService.getAccount();
    await reportWorkerId(signer);
  }

  private async registerSolverInRegistry() {
    const signer = this.nearService.getAccount();
    let worker = await getWorker(this.nearService, signer.accountId);
    if (!worker) {
      let balance = '0';
      while (balance === '0') {
        balance = await this.nearService.getBalance();
        if (balance !== '0') {
          this.logger.info(`The account has balance of ${NEAR.from(balance).toHuman()}.`);
          break;
        }
        this.logger.info(`Account has no balance. Waiting to be funded...`);
        await sleep(60_000);
      }

      // register worker with the public key derived from TEE
      const publicKey = this.nearService.getAccountPublicKey();
      await registerWorker(signer, publicKey);
      this.logger.info(`Worker registered`);
      worker = await getWorker(this.nearService, signer.accountId);
    } else {
      this.logger.warn(`Worker already registered`);
    }

    this.logger.info(`Worker: ${JSON.stringify(worker)}`);
  }

  private async queryPingTimeoutMs() {
    if (!this.pingTimeoutMs) {
      this.pingTimeoutMs = await getWorkerPingTimeoutMs(this.nearService);
    }
    return this.pingTimeoutMs;
  }

  private async heartbeat() {
    const pingTimeoutMs = await this.queryPingTimeoutMs();
    if (!pingTimeoutMs) {
      this.logger.error('Worker ping timeout not available');
      return;
    }

    try {
      const signer = this.nearService.getAccount();
      await pRetry(async () => await pingRegistry(signer), {retries: 5})

      this.logger.info(`Pinged registry successfully`);
    } catch (error) {
      this.logger.error(`Failed to ping registry: ${error}`);
    }

    // ping again after half of the timeout
    setTimeout(async () => {
      await this.heartbeat();
    }, pingTimeoutMs / 2);
  }
}
