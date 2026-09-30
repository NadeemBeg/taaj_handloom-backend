import { Router } from 'express';
import * as controller from './auth.controller.js';
import { loginSchema, createUserSchema, updateUserSchema, userParamsSchema } from './auth.validators.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { authLimiter } from '../../middlewares/rateLimiters.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), controller.loginHandler);
router.post('/refresh', controller.refreshHandler);
router.post('/logout', controller.logoutHandler);
router.get('/me', authenticate, controller.meHandler);

// Admin user management — only SUPER_ADMIN may manage staff accounts.
const superGuard = [authenticate, authorize('SUPER_ADMIN')];
router.get('/users', ...superGuard, controller.listUsersHandler);
router.post('/users', ...superGuard, validate({ body: createUserSchema }), controller.createUserHandler);
router.patch(
  '/users/:id',
  ...superGuard,
  validate({ params: userParamsSchema, body: updateUserSchema }),
  controller.updateUserHandler,
);

export default router;
