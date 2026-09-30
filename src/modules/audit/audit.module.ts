import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AuditLog } from '../../models/AuditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendPaginated } from '../../utils/apiResponse.js';
import { buildPaginationMeta, getSkip } from '../../utils/pagination.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  entity: z.string().trim().optional(),
});

const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = {};
  if (q.entity) filter.entity = q.entity;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(getSkip(q.page, q.limit))
      .limit(q.limit)
      .populate('actor', 'name email'),
    AuditLog.countDocuments(filter),
  ]);
  sendPaginated(res, items, buildPaginationMeta(total, q.page, q.limit), 'Audit log fetched');
});

const router = Router();
router.get('/', authenticate, authorize('ADMIN'), validate({ query: listQuerySchema }), listHandler);

export default router;
