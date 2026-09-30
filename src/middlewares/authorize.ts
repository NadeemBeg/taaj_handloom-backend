import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { UserRole } from '@taaj/shared';

/**
 * Role-based guard. SUPER_ADMIN implicitly passes every check. Use after
 * `authenticate`.
 *
 *   router.post('/', authenticate, authorize('SUPER_ADMIN'), handler)
 */
export function authorize(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (req.user.role === 'SUPER_ADMIN') return next();
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}
