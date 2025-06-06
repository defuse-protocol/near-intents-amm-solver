import { CacheService } from './services/cache.service';
import { CronService } from './services/cron.service';
import { IntentsService } from './services/intents.service';
import { NearService } from './services/near.service';
import { QuoterService } from './services/quoter.service';
import { HttpService } from './services/http.service';
import { WebsocketConnectionService } from './services/websocket-connection.servce';
import { WorkerService } from './services/worker.service';

export async function app() {
  const cacheService = new CacheService();

  const nearService = new NearService();
  await nearService.init();

  const intentsService = new IntentsService(nearService);

  const workerService = new WorkerService(nearService);
  await workerService.init();

  const quoterService = new QuoterService(cacheService, nearService, intentsService);
  await quoterService.updateCurrentState();

  const cronService = new CronService(quoterService);
  cronService.start();

  const websocketService = new WebsocketConnectionService(quoterService, cacheService);
  websocketService.start();

  const httpService = new HttpService(nearService);
  httpService.start();
}
