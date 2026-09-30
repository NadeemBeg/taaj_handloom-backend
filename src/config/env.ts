import 'dotenv/config';
import { z } from 'zod';

/**
 * Validate & type all environment variables at boot. The process refuses to
 * start with an invalid config rather than failing mysteriously at runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  FRONTEND_URL: z.string().url().default('https://taaj-handloom-frontend.vercel.app/'), //http://localhost:3001
  ADMIN_URL: z.string().url().default('https://taaj-handloom-frontend-q8jb.vercel.app/'), //http://localhost:3002

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 chars'),

  WHATSAPP_NUMBER: z.string().min(8, 'WHATSAPP_NUMBER is required'),

  // When true, order creation reserves stock (prevents oversell); default off
  // for the WhatsApp-first flow where orders are confirmed later.
  ORDER_RESERVE_STOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  REDIS_URL: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
   
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
     
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Origins allowed by CORS. */
export const corsOrigins = [env.FRONTEND_URL, env.ADMIN_URL];
