import { Router } from 'express';
import * as controller from './category.controller.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryParamsSchema,
  categorySlugSchema,
} from './category.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const router = Router();

// Public
router.get('/', controller.listHandler);
router.get('/:slug', validate({ params: categorySlugSchema }), controller.getBySlugHandler);

// Admin (SUPER_ADMIN / ADMIN)
const adminGuard = [authenticate, authorize('ADMIN')];

router.post('/', ...adminGuard, validate({ body: createCategorySchema }), controller.createHandler);
router.patch(
  '/:id',
  ...adminGuard,
  validate({ params: categoryParamsSchema, body: updateCategorySchema }),
  controller.updateHandler,
);
router.delete(
  '/:id',
  ...adminGuard,
  validate({ params: categoryParamsSchema }),
  controller.deleteHandler,
);

export default router;
