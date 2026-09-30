import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { Customer } from '../../models/Customer.js';
import { Order } from '../../models/Order.js';
import { CUSTOMER_TYPES, objectIdSchema } from '@taaj/shared';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse.js';
import { buildPaginationMeta, getSkip } from '../../utils/pagination.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(CUSTOMER_TYPES).optional(),
  search: z.string().trim().optional(),
});
const idParams = z.object({ id: objectIdSchema });

const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = {};
  if (q.type) filter.type = q.type;
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(getSkip(q.page, q.limit)).limit(q.limit),
    Customer.countDocuments(filter),
  ]);
  sendPaginated(res, items, buildPaginationMeta(total, q.page, q.limit), 'Customers fetched');
});

const detailHandler = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');
  const orders = await Order.find({ customer: customer.id })
    .select('orderNumber amounts status createdAt')
    .sort({ createdAt: -1 })
    .limit(20);
  sendSuccess(res, { customer: customer.toJSON(), orders }, 'Customer fetched');
});

const router = Router();
const guard = [authenticate, authorize('ADMIN', 'ORDER_MANAGER')];
router.get('/', ...guard, validate({ query: listQuerySchema }), listHandler);
router.get('/:id', ...guard, validate({ params: idParams }), detailHandler);

export default router;
