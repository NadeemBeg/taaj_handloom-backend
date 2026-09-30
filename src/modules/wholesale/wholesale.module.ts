import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { WholesaleCustomer } from '../../models/WholesaleCustomer.js';
import { Customer } from '../../models/Customer.js';
import { objectIdSchema } from '@taaj/shared';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const createSchema = z.object({
  customer: objectIdSchema,
  businessName: z.string().trim().min(2),
  gstin: z.string().trim().optional(),
  minOrderQty: z.number().int().min(1).default(1),
  notes: z.string().max(1000).optional(),
  isApproved: z.boolean().optional(),
});
const updateSchema = createSchema.partial().omit({ customer: true });
const idParams = z.object({ id: objectIdSchema });

const listHandler = asyncHandler(async (_req: Request, res: Response) => {
  const items = await WholesaleCustomer.find()
    .populate('customer', 'name phone whatsapp email')
    .sort({ createdAt: -1 });
  sendSuccess(res, { items }, 'Wholesale customers fetched');
});

const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.body.customer);
  if (!customer) throw ApiError.badRequest('Customer does not exist');
  if (await WholesaleCustomer.exists({ customer: req.body.customer })) {
    throw ApiError.conflict('This customer is already a wholesale customer');
  }
  const wholesale = await WholesaleCustomer.create(req.body);
  customer.set('type', 'WHOLESALE');
  await customer.save();
  sendSuccess(res, { wholesale }, 'Wholesale customer created', 201);
});

const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const wholesale = await WholesaleCustomer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!wholesale) throw ApiError.notFound('Wholesale customer not found');
  sendSuccess(res, { wholesale }, 'Wholesale customer updated');
});

const router = Router();
const guard = [authenticate, authorize('ADMIN')];
router.get('/', ...guard, listHandler);
router.post('/', ...guard, validate({ body: createSchema }), createHandler);
router.patch('/:id', ...guard, validate({ params: idParams, body: updateSchema }), updateHandler);

export default router;
