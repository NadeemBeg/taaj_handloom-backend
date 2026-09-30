import { Router } from 'express';
import * as controller from './banner.controller.js';
import {
  createBannerSchema,
  updateBannerSchema,
  bannerParamsSchema,
  bannerListQuerySchema,
} from './banner.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const router = Router();

// Public — active banners (storefront hero slider etc.)
router.get('/', validate({ query: bannerListQuerySchema }), controller.listPublicHandler);

// Admin (SUPER_ADMIN / ADMIN)
const adminGuard = [authenticate, authorize('ADMIN')];

router.get('/admin', ...adminGuard, validate({ query: bannerListQuerySchema }), controller.listAdminHandler);
router.post('/', ...adminGuard, validate({ body: createBannerSchema }), controller.createHandler);
router.patch(
  '/:id',
  ...adminGuard,
  validate({ params: bannerParamsSchema, body: updateBannerSchema }),
  controller.updateHandler,
);
router.delete('/:id', ...adminGuard, validate({ params: bannerParamsSchema }), controller.deleteHandler);

export default router;
