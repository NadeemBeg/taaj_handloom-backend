import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import categoryRoutes from './modules/categories/category.routes.js';
import productRoutes from './modules/products/product.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import customerRoutes from './modules/customers/customer.module.js';
import wholesaleRoutes from './modules/wholesale/wholesale.module.js';
import reportRoutes from './modules/reports/report.module.js';
import uploadRoutes from './modules/uploads/upload.module.js';
import bannerRoutes from './modules/banners/banner.routes.js';
import settingsRoutes from './modules/settings/settings.module.js';
import auditRoutes from './modules/audit/audit.module.js';
import couponRoutes from './modules/coupons/coupon.module.js';
import { auditRecorder } from './middlewares/auditRecorder.js';

/**
 * API v1 router. Feature modules are mounted here as they are built
 * (auth, products, categories, orders, inventory, ...).
 */
const apiRouter = Router();

// Record privileged writes to the audit trail (no-op for reads / anonymous).
apiRouter.use(auditRecorder);

apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/wholesale', wholesaleRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/uploads', uploadRoutes);
apiRouter.use('/banners', bannerRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/audit-logs', auditRoutes);
apiRouter.use('/coupons', couponRoutes);

export default apiRouter;
