import { inspect } from 'util';
import * as winston from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

const rootLogger = winston.createLogger({
  level: process.env.LOG_LEVEL,
  transports: new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(
        (info) =>
          `${info.timestamp} ${info.level} ${info.module ? `[${info.module}]` : ''} ${
            info.correlationId ? `[${info.correlationId}]` : ''
          } ${info.message} ${info.error ? `\x1b[31m[${inspect(info.error, { depth: Infinity })}]\x1b[37m` : ''}`,
      ),
    ),
  }),
});

export class LoggerService {
  private readonly winston: winston.Logger;

  public constructor(public module?: string, public correlationId?: string) {
    this.winston = rootLogger.child({ module, correlationId });
  }

  public error(message: string, error?: Error) {
    this.log(LogLevel.ERROR, message, error);
  }

  public warn(message: string) {
    this.log(LogLevel.WARN, message);
  }

  public info(message: string) {
    this.log(LogLevel.INFO, message);
  }

  public debug(message: string) {
    this.log(LogLevel.DEBUG, message);
  }

  public log(level: LogLevel, message: string, error?: Error) {
    this.winston.log({ level, message, error });
  }

  public toScopeLogger(correlationId: string) {
    return new LoggerService(this.module, correlationId);
  }
}
