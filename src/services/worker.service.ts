import { NearService } from './near.service';
import { getPool, registerWorker } from 'src/utils/agent';
import { getWorker } from 'src/utils/agent';
import { sleep } from 'src/utils/sleep';
import { LoggerService } from './logger.service';
import { NEAR } from 'near-units';
import { solverPoolId } from 'src/configs/intents.config';

export class WorkerService {
  public constructor(private readonly nearService: NearService) {}

  private logger = new LoggerService('worker');

  public async init(): Promise<void> {
    await this.verifyTokenIds();
    await this.registerSolverInRegistry();
  }

  private async verifyTokenIds() {
    const pool = await getPool(this.nearService.getAccount(), Number(solverPoolId!));
    if (!pool) {
      throw new Error('Pool not found');
    }
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
  }

  private async registerSolverInRegistry() {
    let worker = await getWorker(this.nearService.getAccount());
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
      await registerWorker(this.nearService.getAccount());
      this.logger.info(`Worker registered`);
      worker = await getWorker(this.nearService.getAccount());
    }

    this.logger.info(`Worker: ${JSON.stringify(worker)}`);
  }
}
