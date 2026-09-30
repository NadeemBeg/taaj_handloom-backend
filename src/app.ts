import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env, corsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
import apiRouter from './routes.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Locally-hosted media (product/category images) live in backend/public. */
const PUBLIC_DIR = path.resolve(__dirname, '../public');

/** Build and configure the Express application (no listening — see server.ts). */
export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  // Locally-hosted media — served before helmet so the same-origin CORP header
  // isn't applied, letting the storefront (3001) and admin (3002) load images.
  app.use(
    '/static',
    express.static(PUBLIC_DIR, {
      maxAge: '7d',
      immutable: false,
      setHeaders(res) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  // Security headers
  app.use(helmet());

  // CORS — allowlist store + admin origins; allow credentials for refresh cookie
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );

  // Body parsing with size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Sanitize against NoSQL/operator injection
  app.use(mongoSanitize());

  // Compression + request logging
  app.use(compression());
  app.use(pinoHttp({ logger }));

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, please try again later.' },
    }),
  );

  // API routes
  app.use(env.API_PREFIX, apiRouter);

  // 404 + centralized errors
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
