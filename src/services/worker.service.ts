import { NearService } from './near.service';
import { registerWorker } from 'src/utils/agent';
import { getWorker } from 'src/utils/agent';
import { sleep } from 'src/utils/sleep';
import { LoggerService } from './logger.service';

export class WorkerService {
  public constructor(private readonly nearService: NearService) {}

  private logger = new LoggerService('intents');

  public async init(): Promise<void> {
    await this.registerSolverInRegistry();
  }

  private async registerSolverInRegistry() {
    let worker = await getWorker(this.nearService.getAccount());
    if (!worker) {
      let balance = '0';
      while (balance === '0') {
        balance = await this.nearService.getBalance();
        this.logger.info(`Waiting for balance to be funded: ${balance}`);
        await sleep(60_000);
      }
      await registerWorker(this.nearService.getAccount());
      this.logger.info(`Worker registered`);
      worker = await getWorker(this.nearService.getAccount());
    }

    this.logger.info(`Worker: ${JSON.stringify(worker)}`);
  }
}
