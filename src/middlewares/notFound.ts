import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';

/** 404 handler for unmatched routes. */
export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
