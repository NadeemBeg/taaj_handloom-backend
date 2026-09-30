import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Coupon } from '../../models/Coupon.js';
import { COUPON_TYPES, objectIdSchema } from '@taaj/shared';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const createSchema = z.object({
  code: z.string().trim().min(3).max(32),
  type: z.enum(COUPON_TYPES).default('PERCENT'),
  value: z.number().min(0),
  minSubtotal: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
const idParams = z.object({ id: objectIdSchema });

const listHandler = asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  sendSuccess(res, { coupons }, 'Coupons fetched');
});

// Public: validate a code against a subtotal and return the computed discount.
const validateSchema = z.object({
  code: z.string().trim().min(1),
  subtotal: z.coerce.number().min(0),
});

export interface ResolvedCoupon {
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  discount: number;
}

/** Validate a coupon against a subtotal; throws ApiError if not applicable. */
export async function resolveCoupon(code: string, subtotal: number): Promise<ResolvedCoupon> {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
  const now = new Date();

  if (!coupon || !coupon.isActive) throw ApiError.badRequest('This coupon code is not valid.');
  if (coupon.startsAt && coupon.startsAt > now) throw ApiError.badRequest('This coupon is not active yet.');
  if (coupon.endsAt && coupon.endsAt < now) throw ApiError.badRequest('This coupon has expired.');
  if (coupon.usageLimit != null && (coupon.usedCount ?? 0) >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit.');
  }
  if (subtotal < (coupon.minSubtotal ?? 0)) {
    throw ApiError.badRequest('Add more to reach the minimum order for this coupon.');
  }

  let discount = coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(Math.round(discount), subtotal);

  return { code: coupon.code, type: coupon.type as 'PERCENT' | 'FLAT', value: coupon.value, discount };
}

/** Increment a coupon's usage counter (best-effort, after an order is placed). */
export async function incrementCouponUsage(code: string): Promise<void> {
  await Coupon.updateOne({ code: String(code).toUpperCase() }, { $inc: { usedCount: 1 } });
}

const validateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { code, subtotal } = req.body as z.infer<typeof validateSchema>;
  const resolved = await resolveCoupon(code, subtotal);
  sendSuccess(res, resolved, 'Coupon applied');
});

const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.body.code).toUpperCase();
  if (await Coupon.exists({ code })) throw ApiError.conflict('A coupon with this code already exists');
  const coupon = await Coupon.create({ ...req.body, code });
  sendSuccess(res, { coupon }, 'Coupon created', 201);
});

const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const patch = { ...req.body };
  if (patch.code) patch.code = String(patch.code).toUpperCase();
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  sendSuccess(res, { coupon }, 'Coupon updated');
});

const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await Coupon.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('Coupon not found');
  sendSuccess(res, null, 'Coupon deleted');
});

const router = Router();
const guard = [authenticate, authorize('ADMIN')];

// Public
router.post('/validate', validate({ body: validateSchema }), validateHandler);

// Admin
router.get('/', ...guard, listHandler);
router.post('/', ...guard, validate({ body: createSchema }), createHandler);
router.patch('/:id', ...guard, validate({ params: idParams, body: updateSchema }), updateHandler);
router.delete('/:id', ...guard, validate({ params: idParams }), deleteHandler);

export default router;
