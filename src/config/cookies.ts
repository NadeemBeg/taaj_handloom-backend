import type { CookieOptions } from 'express';
import { isProd } from './env.js';

export const REFRESH_COOKIE_NAME = 'taaj_rt';

/** HTTP-only refresh cookie options. Secure + SameSite=strict in production. */
export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
    signed: true,
  };
}

/** Options used when clearing the cookie (must match path/flags). */
export function clearRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/api/v1/auth',
    signed: true,
  };
}
