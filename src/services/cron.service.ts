import { LoggerService } from './logger.service';
import { QuoterService } from './quoter.service';

export class CronService {
  private logger = new LoggerService('cron');

  public constructor(private readonly quoterService: QuoterService) {}

  public start() {
    setInterval(() => this.updateQuoterState(), 15000);
    this.logger.info('Cron service started');
  }

  private async updateQuoterState(): Promise<void> {
    try {
      await this.quoterService.updateCurrentState();
    } catch (error) {
      this.logger.error('Error updating quoter state', error as Error);
    }
  }
}
