import { Router } from 'express';
import * as controller from './inventory.controller.js';
import { adjustStockSchema, transactionsQuerySchema } from './inventory.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const router = Router();

// All inventory operations require ADMIN or INVENTORY_MANAGER.
const guard = [authenticate, authorize('ADMIN', 'INVENTORY_MANAGER')];

router.post('/adjust', ...guard, validate({ body: adjustStockSchema }), controller.adjustHandler);
router.get(
  '/transactions',
  ...guard,
  validate({ query: transactionsQuerySchema }),
  controller.transactionsHandler,
);
router.get('/low-stock', ...guard, controller.lowStockHandler);

export default router;
