import { Product } from '../../models/Product.js';
import { ProductVariant } from '../../models/ProductVariant.js';
import { InventoryTransaction } from '../../models/InventoryTransaction.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginationMeta, getSkip } from '../../utils/pagination.js';
import type { PaginationMeta, InventoryReason } from '@taaj/shared';
import type { AdjustStockInput, TransactionsQuery } from './inventory.validators.js';

interface StockShape {
  quantity: number;
  reserved: number;
  sold: number;
  lowStockThreshold: number;
}

interface StockTarget {
  productId: string;
  variantId: string | null;
  stock: StockShape;
  persist: () => Promise<void>;
}

/** Load the stock sub-document (variant.stock or product.baseStock) plus a persist fn. */
async function loadStockTarget(productId: string, variantId?: string | null): Promise<StockTarget> {
  if (variantId) {
    const variant = await ProductVariant.findById(variantId);
    if (!variant) throw ApiError.notFound('Variant not found');
    if (variant.product.toString() !== productId) {
      throw ApiError.badRequest('Variant does not belong to the given product');
    }
    return {
      productId,
      variantId,
      stock: variant.stock as unknown as StockShape,
      persist: async () => {
        variant.markModified('stock');
        await variant.save();
      },
    };
  }
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  return {
    productId,
    variantId: null,
    stock: product.baseStock as unknown as StockShape,
    persist: async () => {
      product.markModified('baseStock');
      await product.save();
    },
  };
}

export function availableOf(stock: StockShape): number {
  return stock.quantity - stock.reserved;
}

/**
 * Apply a signed stock change and record an immutable audit transaction.
 * Rejects changes that would drive on-hand quantity below zero.
 */
export async function adjustStock(
  input: AdjustStockInput,
  performedBy?: string,
): Promise<{ transaction: unknown; stock: StockShape }> {
  const target = await loadStockTarget(input.product, input.variant ?? null);

  const previous = target.stock.quantity;
  const next = previous + input.change;
  if (next < 0) {
    throw ApiError.badRequest(
      `Insufficient stock: on-hand is ${previous}, cannot apply change of ${input.change}`,
    );
  }

  target.stock.quantity = next;
  // Selling/wholesale reductions also accrue the sold counter.
  if (input.change < 0 && (input.reason === 'SALE' || input.reason === 'WHOLESALE_ORDER')) {
    target.stock.sold += -input.change;
  }
  await target.persist();

  const transaction = await InventoryTransaction.create({
    product: target.productId,
    variant: target.variantId,
    previousStock: previous,
    newStock: next,
    change: input.change,
    reason: input.reason,
    note: input.note ?? '',
    performedBy: performedBy ?? null,
  });

  return { transaction, stock: target.stock };
}

/**
 * Reserve `qty` units for an order (available must cover it). Does not touch
 * on-hand quantity — reservation is released or committed later.
 */
export async function reserveStock(
  productId: string,
  variantId: string | null,
  qty: number,
): Promise<void> {
  if (qty <= 0) throw ApiError.badRequest('Reserve quantity must be positive');
  const target = await loadStockTarget(productId, variantId);
  if (availableOf(target.stock) < qty) {
    throw ApiError.badRequest('Insufficient stock to reserve');
  }
  target.stock.reserved += qty;
  await target.persist();
}

/** Release a previously held reservation (e.g. order cancelled). */
export async function releaseReservation(
  productId: string,
  variantId: string | null,
  qty: number,
): Promise<void> {
  const target = await loadStockTarget(productId, variantId);
  target.stock.reserved = Math.max(0, target.stock.reserved - qty);
  await target.persist();
}

/**
 * Commit a reserved sale: decrement on-hand + reserved, increment sold, and
 * log a SALE/WHOLESALE_ORDER transaction.
 */
export async function commitSale(
  productId: string,
  variantId: string | null,
  qty: number,
  opts: { reason?: Extract<InventoryReason, 'SALE' | 'WHOLESALE_ORDER'>; performedBy?: string } = {},
): Promise<void> {
  const reason = opts.reason ?? 'SALE';
  const target = await loadStockTarget(productId, variantId);
  const previous = target.stock.quantity;
  if (previous < qty) throw ApiError.badRequest('Insufficient stock to fulfil sale');

  target.stock.quantity = previous - qty;
  target.stock.reserved = Math.max(0, target.stock.reserved - qty);
  target.stock.sold += qty;
  await target.persist();

  await InventoryTransaction.create({
    product: productId,
    variant: variantId,
    previousStock: previous,
    newStock: target.stock.quantity,
    change: -qty,
    reason,
    performedBy: opts.performedBy ?? null,
  });
}

/** Products/variants at or below their low-stock threshold. */
export async function getLowStock(): Promise<{
  products: unknown[];
  variants: unknown[];
}> {
  const [products, variants] = await Promise.all([
    Product.find({
      hasVariants: false,
      'flags.isActive': true,
      $expr: {
        $lte: [{ $subtract: ['$baseStock.quantity', '$baseStock.reserved'] }, '$baseStock.lowStockThreshold'],
      },
    }).select('name sku baseStock'),
    ProductVariant.find({
      isActive: true,
      $expr: { $lte: [{ $subtract: ['$stock.quantity', '$stock.reserved'] }, '$stock.lowStockThreshold'] },
    })
      .select('sku color stock product')
      .populate('product', 'name sku'),
  ]);

  return { products, variants };
}

/** Paginated inventory history with optional filters. */
export async function listTransactions(
  query: TransactionsQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.product) filter.product = query.product;
  if (query.variant) filter.variant = query.variant;
  if (query.reason) filter.reason = query.reason;

  const [items, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(getSkip(query.page, query.limit))
      .limit(query.limit)
      .populate('product', 'name sku')
      .populate('performedBy', 'name email'),
    InventoryTransaction.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
}
