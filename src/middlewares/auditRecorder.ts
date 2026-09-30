import type { NextFunction, Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../config/logger.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records privileged writes to the audit trail. Registers a response-finish
 * hook so `req.user` (set by `authenticate`) is available by the time it runs.
 * Fire-and-forget: never blocks or fails the request.
 */
export function auditRecorder(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();

  // Capture the path NOW — Express mutates req.url/req.path as it routes deeper,
  // so it is unreliable inside the later "finish" handler.
  const method = req.method;
  const originalUrl = req.originalUrl;
  const ip = req.ip;
  const segments = (req.path || '').split('/').filter(Boolean);
  const entity = segments[0];
  const entityId = segments.find((s) => /^[a-f0-9]{24}$/i.test(s));

  res.on('finish', () => {
    // Only successful, authenticated writes are worth recording.
    if (!req.user || res.statusCode >= 400) return;

    void AuditLog.create({
      actor: req.user.id,
      action: method,
      entity,
      entityId,
      path: originalUrl,
      statusCode: res.statusCode,
      ip,
    }).catch((err) => logger.warn({ err }, 'Failed to write audit log'));
  });

  next();
}
