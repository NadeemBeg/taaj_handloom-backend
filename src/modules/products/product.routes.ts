import { Router } from 'express';
import * as controller from './product.controller.js';
import {
  createProductSchema,
  updateProductSchema,
  productParamsSchema,
  productSlugSchema,
  productListQuerySchema,
  searchQuerySchema,
  createVariantSchema,
  updateVariantSchema,
  variantParamsSchema,
} from './product.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const router = Router();
const adminGuard = [authenticate, authorize('ADMIN', 'INVENTORY_MANAGER')];

// ── Public catalog ──
router.get('/', validate({ query: productListQuerySchema }), controller.listHandler);
router.get('/search', validate({ query: searchQuerySchema }), controller.searchHandler);
router.get('/:slug', validate({ params: productSlugSchema }), controller.getBySlugHandler);

// ── Variants (list is public via product) ──
router.get(
  '/:id/variants',
  validate({ params: productParamsSchema }),
  controller.listVariantsHandler,
);

// ── Admin: product CRUD ──
router.post('/', ...adminGuard, validate({ body: createProductSchema }), controller.createHandler);
router.patch(
  '/:id',
  ...adminGuard,
  validate({ params: productParamsSchema, body: updateProductSchema }),
  controller.updateHandler,
);
router.delete(
  '/:id',
  ...adminGuard,
  validate({ params: productParamsSchema }),
  controller.deleteHandler,
);

// ── Admin: variant CRUD ──
router.post(
  '/:id/variants',
  ...adminGuard,
  validate({ params: productParamsSchema, body: createVariantSchema }),
  controller.addVariantHandler,
);
router.patch(
  '/variants/:variantId',
  ...adminGuard,
  validate({ params: variantParamsSchema, body: updateVariantSchema }),
  controller.updateVariantHandler,
);
router.delete(
  '/variants/:variantId',
  ...adminGuard,
  validate({ params: variantParamsSchema }),
  controller.deleteVariantHandler,
);

export default router;
