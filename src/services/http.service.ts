import { createServer, Server } from 'http';
import { LoggerService } from './logger.service';

export class HttpService {
  private server: Server;

  private logger = new LoggerService('http');

  public constructor() {
    this.server = createServer((req, resp) => {
      if (req.url === '/') {
        resp.writeHead(200);
        resp.end(JSON.stringify({ ready: true }));
      } else {
        resp.writeHead(404);
        resp.end();
      }
    });
    this.server.on('error', (err) => {
      throw err;
    });
  }

  public start() {
    const port = process.env.APP_PORT;
    this.server.listen(port, () => {
      this.logger.info(`HTTP server started listening on port ${port}`);
    });
  }
}
