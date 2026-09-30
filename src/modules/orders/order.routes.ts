import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from './order.controller.js';
import {
  createOrderSchema,
  orderNumberParamsSchema,
  orderIdParamsSchema,
  orderListQuerySchema,
  updateStatusSchema,
} from './order.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { isTest } from '../../config/env.js';

const router = Router();

// Throttle public order creation to deter abuse.
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many orders from this device, please try again later.' },
});

router.post('/', orderLimiter, validate({ body: createOrderSchema }), controller.createOrderHandler);

// ── Admin (declared before the public "/:orderNumber" catch) ──
const adminGuard = [authenticate, authorize('ADMIN', 'ORDER_MANAGER')];
router.get('/admin', ...adminGuard, validate({ query: orderListQuerySchema }), controller.listOrdersHandler);
router.get('/admin/:id', ...adminGuard, validate({ params: orderIdParamsSchema }), controller.getOrderByIdHandler);
router.patch(
  '/admin/:id/status',
  ...adminGuard,
  validate({ params: orderIdParamsSchema, body: updateStatusSchema }),
  controller.updateStatusHandler,
);

// ── Public confirmation lookup ──
router.get('/:orderNumber', validate({ params: orderNumberParamsSchema }), controller.getOrderHandler);

export default router;
