import { Router } from 'express';
import type { Request, Response } from 'express';
import { Product } from '../../models/Product.js';
import { ProductVariant } from '../../models/ProductVariant.js';
import { Category } from '../../models/Category.js';
import { Customer } from '../../models/Customer.js';
import { Order } from '../../models/Order.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getLowStock } from '../inventory/inventory.service.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

async function totalStock(): Promise<number> {
  const [base, variant] = await Promise.all([
    Product.aggregate([
      { $match: { hasVariants: false } },
      { $group: { _id: null, sum: { $sum: '$baseStock.quantity' } } },
    ]),
    ProductVariant.aggregate([{ $group: { _id: null, sum: { $sum: '$stock.quantity' } } }]),
  ]);
  return (base[0]?.sum ?? 0) + (variant[0]?.sum ?? 0);
}

const dashboardHandler = asyncHandler(async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const [
    products,
    activeProducts,
    categories,
    customers,
    wholesaleCustomers,
    orders,
    stock,
    low,
    ordersByStatusAgg,
    ordersByDayAgg,
    salesByCategoryAgg,
    bestSellers,
    recentOrders,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ 'flags.isActive': true }),
    Category.countDocuments(),
    Customer.countDocuments(),
    Customer.countDocuments({ type: 'WHOLESALE' }),
    Order.countDocuments(),
    totalStock(),
    getLowStock(),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$amounts.total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $lookup: { from: 'categories', localField: 'p.category', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      { $group: { _id: '$c.name', revenue: { $sum: '$items.lineTotal' }, units: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
    ]),
    Product.find().sort({ salesCount: -1 }).limit(5).select('name sku salesCount pricing media.mainImage'),
    Order.find().sort({ createdAt: -1 }).limit(6).select('orderNumber contact.name amounts status createdAt'),
  ]);

  const outOfStock = low.products.filter(
    (p) => ((p as { baseStock?: { quantity: number; reserved: number } }).baseStock?.quantity ?? 0) -
      ((p as { baseStock?: { reserved: number } }).baseStock?.reserved ?? 0) <= 0,
  ).length;

  sendSuccess(
    res,
    {
      counts: { products, activeProducts, categories, customers, wholesaleCustomers, orders },
      stock: { total: stock, lowStock: low.products.length + low.variants.length, outOfStock },
      ordersByStatus: ordersByStatusAgg.map((o) => ({ status: o._id, count: o.count })),
      ordersByDay: ordersByDayAgg.map((o) => ({ date: o._id, count: o.count, revenue: o.revenue })),
      salesByCategory: salesByCategoryAgg.map((c) => ({ category: c._id, revenue: c.revenue, units: c.units })),
      bestSellers,
      recentOrders,
    },
    'Dashboard report',
  );
});

const router = Router();
router.get('/dashboard', authenticate, authorize('ADMIN', 'ORDER_MANAGER', 'INVENTORY_MANAGER'), dashboardHandler);

export default router;
