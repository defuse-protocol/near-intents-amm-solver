import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import {
  IJsonrpcRelayRequest,
  IJsonrpcResponse,
  IJsonrpcEventNotification,
  IPublishedQuoteData,
  IQuoteRequestData,
  IQuoteResponseData,
  ISubscription,
  RelayMethod,
  RelayEventKind,
} from '../interfaces/websocket.interface';
import { tokens } from '../configs/tokens';
import { wsRelayUrl } from '../configs/websocket.config';
import { LoggerService } from './logger.service';
import { QuoterService } from './quoter.service';
import { CacheService } from './cache.service';

export class WebsocketConnectionService {
  private wsConnection!: WebSocket;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, ISubscription> = new Map();
  private requestCounter = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = Infinity;
  private pendingRequests: Map<number, (response: IJsonrpcResponse) => void> = new Map();

  private logger = new LoggerService('websocket');

  public constructor(private readonly quoterService: QuoterService, private readonly cacheService: CacheService) {}

  public start() {
    this.wsConnection = new WebSocket(wsRelayUrl);

    const logger = this.logger.toScopeLogger(randomUUID());

    this.wsConnection.on('open', this.handleOpen.bind(this, logger));
    this.wsConnection.on('message', this.handleMessage.bind(this, logger));
    this.wsConnection.on('close', this.handleClose.bind(this, logger));
    this.wsConnection.on('error', this.handleError.bind(this, logger));
  }

  public stop() {
    this.wsConnection.close();
    this.clearReconnectInterval();
  }

  private async sendRequestToRelay<TResult = unknown>(method: RelayMethod, params: unknown[], logger: LoggerService) {
    logger.debug(`Number of pending requests before send: ${Object.keys(this.pendingRequests).length}`);
    const request: IJsonrpcRelayRequest = {
      id: this.requestCounter++,
      jsonrpc: '2.0',
      method,
      params,
    };
    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('Request timed out'));
        }
      }, 5000);

      const onResponse = (response: IJsonrpcResponse) => {
        clearTimeout(timeout);
        if (response.error) {
          reject(new Error(`Relay error: ${JSON.stringify(response.error)}`));
        } else {
          resolve(response.result as TResult);
        }
      };

      this.pendingRequests.set(request.id, onResponse);

      try {
        this.wsConnection.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        reject(error);
      }
    });
  }

  private handleOpen(logger: LoggerService) {
    logger.info(`WebSocket client connected to ${wsRelayUrl}`);
    this.reconnectAttempts = 0;
    this.clearReconnectInterval();
    this.subscribe(RelayEventKind.QUOTE, logger);
    this.subscribe(RelayEventKind.QUOTE_STATUS, logger);
  }

  private handleClose(logger: LoggerService) {
    logger.info('WebSocket client closed. Attempting to restart...');
    this.setReconnectInterval(logger);
  }

  private handleError(logger: LoggerService, error: Error) {
    logger.error('WebSocket error', error);
  }

  private setReconnectInterval(logger: LoggerService) {
    if (!this.reconnectInterval) {
      this.reconnectInterval = setInterval(() => {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.error('Maximum reconnect attempts reached. Could not reconnect to WebSocket server.');
          this.clearReconnectInterval();
          return;
        }

        this.reconnectAttempts++;
        logger.info(`Attempting to reconnect... (attempt ${this.reconnectAttempts})`);
        this.start();
      }, 5000);
    }
  }

  private clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private async handleMessage(logger: LoggerService, message: string) {
    let req: IJsonrpcEventNotification | IJsonrpcResponse;
    try {
      req = JSON.parse(message);
    } catch (error) {
      logger.error('Invalid JSON RPC message', error as Error);
      return;
    }

    logger.debug(`Got new message: ${JSON.stringify(req)}`);

    if ('id' in req && typeof req.id === 'number') {
      // req is a response to the solver's request
      const callback = this.pendingRequests.get(req.id);
      if (!callback) {
        logger.debug(`Unknown request id: ${req.id}`);
        return;
      }
      callback(req);
      this.pendingRequests.delete(req.id);
    } else if ('method' in req && req.method === 'event' && typeof req?.params?.subscription === 'string') {
      // req is an event notification from the relay
      const subscriptionId = req.params.subscription;
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) {
        logger.debug(`Unknown subscriptionId: ${subscriptionId}`);
        return;
      }

      switch (subscription.eventKind) {
        case RelayEventKind.QUOTE:
          this.processQuote(req.params.data as IQuoteRequestData);
          break;
        case RelayEventKind.QUOTE_STATUS:
          this.processQuoteStatus(req.params.data as IPublishedQuoteData);
          break;
        default:
          logger.debug(`Unknown subscription event kind: ${subscription.eventKind}`);
          return;
      }
    } else {
      logger.debug(`Unrecognized incoming message: ${JSON.stringify(req)}`);
      return;
    }
  }

  private async processQuote(quoteReq: IQuoteRequestData) {
    const { quote_id, defuse_asset_identifier_in, defuse_asset_identifier_out } = quoteReq;
    const logger = this.logger.toScopeLogger(quote_id);

    try {
      if (!this.isTokenPairSupported(defuse_asset_identifier_in, defuse_asset_identifier_out)) {
        logger.debug(`Skipping unsupported pair (${defuse_asset_identifier_in} -> ${defuse_asset_identifier_out})`);
        return;
      }

      logger.info(`Received supported quote request: ${JSON.stringify(quoteReq)}`);

      const quoteResp = await this.quoterService.getQuoteResponse(quoteReq);
      if (!quoteResp) {
        return;
      }

      const result = await this.sendRequestToRelay(RelayMethod.QUOTE_RESPONSE, [quoteResp], logger);
      logger.info(`Sent quote response to relay, result: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error(
        `Error while processing quote ${defuse_asset_identifier_in}->${defuse_asset_identifier_out}`,
        error as Error,
      );
    }
  }

  private async processQuoteStatus(data: IPublishedQuoteData) {
    const logger = this.logger.toScopeLogger(data.intent_hash);

    logger.info(`Received intent: ${JSON.stringify(data)}`);

    try {
      const quote = this.cacheService.get<IQuoteResponseData>(data.quote_hash);
      if (!quote) {
        logger.debug(`Skipping intent for unknown quote hash '${data.quote_hash}'`);
        return;
      }

      const quoteLogger = logger.toScopeLogger(quote.quote_id);

      quoteLogger.info(`Found own quote '${quote.quote_id}', updating the quoter state...`);

      await this.quoterService.updateCurrentState();

      quoteLogger.info('Updated');
    } catch (error) {
      logger.error('Error while processing intent', error as Error);
    }
  }

  private async subscribe(eventKind: RelayEventKind, logger: LoggerService) {
    const subscriptionId = await this.sendRequestToRelay(RelayMethod.SUBSCRIBE, [eventKind], logger);
    logger.debug(`Got subscriptionId for '${eventKind}': ${subscriptionId}`);
    if (typeof subscriptionId !== 'string') {
      throw new Error(`Unexpected subscriptionId type`);
    }
    this.subscriptions.set(subscriptionId, { eventKind, subscriptionId });
  }

  private isTokenPairSupported(identifierIn: string, identifierOut: string) {
    if (identifierIn === identifierOut) {
      return false;
    }
    const isSupportedIn = tokens.some((token) => token === identifierIn);
    const isSupportedOut = tokens.some((token) => token === identifierOut);
    return isSupportedIn && isSupportedOut;
  }
}
