import type { Response } from 'express';
import type { PaginationMeta } from '@taaj/shared';

/** Consistent success envelope: { success, message, data }. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
): Response {
  return res.status(statusCode).json({ success: true, message, data });
}

/** Success envelope for paginated lists. */
export function sendPaginated<T>(
  res: Response,
  items: T[],
  meta: PaginationMeta,
  message = 'Success',
): Response {
  return res.status(200).json({ success: true, message, data: { items, meta } });
}
