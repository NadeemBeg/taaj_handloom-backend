import pino from 'pino';
import { env, isProd } from './env.js';

/** Structured application logger (Pino). Pretty in dev, JSON in prod. */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
