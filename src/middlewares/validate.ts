import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError.js';

type Sources = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/**
 * Validate request parts against Zod schemas. Parsed (typed/coerced) values
 * replace the originals so handlers receive clean data.
 */
export function validate(schemas: Sources) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // req.query has only a getter in Express 5-style setups; assign defensively.
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        return next(ApiError.badRequest('Validation failed', errors));
      }
      return next(err);
    }
  };
}
