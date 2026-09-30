import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import type { UserRole } from '@taaj/shared';

/** Authenticated principal attached to the request. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

declare global {
   
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Require a valid Bearer access token. Populates req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Authentication required'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}
