import { Product } from '../../models/Product.js';
import { ProductVariant } from '../../models/ProductVariant.js';
import { Customer } from '../../models/Customer.js';
import { Order, type OrderDoc } from '../../models/Order.js';
import { nextSequence } from '../../models/Counter.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  reserveStock,
  releaseReservation,
  commitSale,
  adjustStock,
} from '../inventory/inventory.service.js';
import { resolveCoupon, incrementCouponUsage } from '../coupons/coupon.module.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { buildWhatsappUrl, type WhatsappOrderLine, type OrderStatus } from '@taaj/shared';
import { buildPaginationMeta, getSkip } from '../../utils/pagination.js';
import type { PaginationMeta } from '@taaj/shared';
import type { CreateOrderInput } from './order.validators.js';

interface ResolvedItem {
  product: string;
  variant: string | null;
  snapshot: { name: string; sku: string; color?: string; image?: string };
  unitPrice: number;
  mrp: number;
  quantity: number;
  lineTotal: number;
  priceType: 'RETAIL' | 'WHOLESALE';
  // Display-only metadata for the WhatsApp message (not persisted on the order).
  display?: { category?: string; slug?: string; categorySlug?: string };
}

/** Resolve each cart item against the DB — authoritative pricing + stock check. */
async function resolveItems(
  input: CreateOrderInput['items'],
  wholesale: boolean,
): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];

  for (const line of input) {

    const product = await Product.findById(line.product).populate('category', 'name slug');
    if (!product || !product.flags?.isActive) {
      throw ApiError.badRequest('One or more products are no longer available');
    }
    const cat = product.category as unknown as { name?: string; slug?: string } | null;

    // Wholesale pricing falls back to retail when no wholesale price is set.
    let unitPrice = wholesale
      ? product.pricing.wholesalePrice ?? product.pricing.price
      : product.pricing.price;
    let mrp = product.pricing.mrp;
    let sku = product.sku;
    let color: string | undefined;
    let image = product.media?.mainImage?.url;
    let stock = product.baseStock;

    if (line.variant) {

      const variant = await ProductVariant.findById(line.variant);
      if (!variant || !variant.isActive || variant.product.toString() !== product.id) {
        throw ApiError.badRequest('Selected variant is unavailable');
      }
      const variantRetail = variant.price ?? product.pricing.price;
      unitPrice = wholesale ? variant.wholesalePrice ?? variant.price ?? unitPrice : variantRetail;
      mrp = variant.mrp ?? mrp;
      sku = variant.sku;
      color = variant.color?.name;
      image = variant.images?.[0]?.url ?? image;
      stock = variant.stock;
    } else if (product.hasVariants) {
      throw ApiError.badRequest(`Please select a variant for ${product.name}`);
    }

    const available = stock ? stock.quantity - stock.reserved : 0;
    if (available < line.quantity) {
      throw ApiError.badRequest(
        `Insufficient stock for ${product.name}${color ? ` (${color})` : ''}`,
      );
    }

    resolved.push({
      product: product.id,
      variant: line.variant ?? null,
      snapshot: { name: product.name, sku, color, image },
      unitPrice,
      mrp,
      quantity: line.quantity,
      lineTotal: unitPrice * line.quantity,
      priceType: wholesale ? 'WHOLESALE' : 'RETAIL',
      display: {
        category: cat?.name,
        slug: product.slug,
        categorySlug: cat?.slug,
      },
    });
  }

  return resolved;
}

async function upsertCustomer(
  contact: CreateOrderInput['contact'],
  address: CreateOrderInput['shippingAddress'],
): Promise<string> {
  const email = contact.email || undefined;
  let customer = await Customer.findOne({ phone: contact.phone });
  if (!customer) {
    customer = await Customer.create({
      name: contact.name,
      phone: contact.phone,
      whatsapp: contact.whatsapp ?? contact.phone,
      email,
      addresses: [address],
    });
  } else {
    customer.set('name', contact.name);
    if (contact.whatsapp) customer.set('whatsapp', contact.whatsapp);
    if (email) customer.set('email', email);
    customer.set('addresses', [address, ...(customer.get('addresses') ?? [])].slice(0, 5));
  }
  customer.set('orderCount', (customer.get('orderCount') ?? 0) + 1);
  await customer.save();
  return customer.id;
}

async function generateOrderNumber(date = new Date()): Promise<string> {
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const seq = await nextSequence(`order-${ym}`);
  return `TH-${ym}-${String(seq).padStart(4, '0')}`;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ order: OrderDoc; whatsappUrl: string }> {
  const wholesale = input.customerType === 'wholesale';
  const items = await resolveItems(input.items, wholesale);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  // Re-validate the coupon server-side against the authoritative subtotal. If it
  // no longer applies (expired, min not met), the order proceeds without it —
  // the business confirms final pricing on WhatsApp anyway.
  let appliedCoupon: { code: string; discount: number } | undefined;
  if (input.couponCode) {
    try {
      const resolved = await resolveCoupon(input.couponCode, subtotal);
      if (resolved.discount > 0) appliedCoupon = { code: resolved.code, discount: resolved.discount };
    } catch {
      appliedCoupon = undefined;
    }
  }

  const discount = appliedCoupon?.discount ?? 0;
  const amounts = { subtotal, discount, total: Math.max(0, subtotal - discount) };

  // Optional reservation (feature-flagged). Availability already validated above.
  if (env.ORDER_RESERVE_STOCK) {
    const reserved: ResolvedItem[] = [];
    try {
      for (const item of items) {
         
        await reserveStock(item.product, item.variant, item.quantity);
        reserved.push(item);
      }
    } catch (err) {
      // Roll back any reservations already made.
      const { releaseReservation } = await import('../inventory/inventory.service.js');
      await Promise.all(reserved.map((i) => releaseReservation(i.product, i.variant, i.quantity)));
      throw err;
    }
  }

  const customerId = await upsertCustomer(input.contact, input.shippingAddress);
  const orderNumber = await generateOrderNumber();

  const order = await Order.create({
    orderNumber,
    customer: customerId,
    contact: {
      name: input.contact.name,
      phone: input.contact.phone,
      whatsapp: input.contact.whatsapp ?? input.contact.phone,
      email: input.contact.email || undefined,
    },
    shippingAddress: input.shippingAddress,
    items,
    amounts,
    customerType: wholesale ? 'WHOLESALE' : 'INDIVIDUAL',
    coupon: appliedCoupon,
    source: 'WEBSITE',
    status: 'NEW',
    notes: input.notes ?? '',
    statusHistory: [{ status: 'NEW' }],
  });

  // Best-effort usage accounting; never fails the order.
  if (appliedCoupon) {
    incrementCouponUsage(appliedCoupon.code).catch((err) =>
      logger.warn({ err }, 'Failed to increment coupon usage'),
    );
  }

  const whatsappUrl = buildWhatsappUrl(env.WHATSAPP_NUMBER, {
    orderNumber,
    items: items.map<WhatsappOrderLine>((i) => ({
      name: i.snapshot.name,
      sku: i.snapshot.sku,
      color: i.snapshot.color,
      category: i.display?.category,
      image: i.snapshot.image,
      productUrl:
        i.display?.categorySlug && i.display?.slug
          ? `${env.FRONTEND_URL.replace(/\/$/, '')}/${i.display.categorySlug}/${i.display.slug}`
          : undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    total: amounts.total,
    coupon: appliedCoupon,
    customerType: input.customerType,
    customer: {
      name: input.contact.name,
      phone: input.contact.phone,
      address: formatAddress(input.shippingAddress),
    },
    note: input.notes,
    placedAt: order.createdAt,
  });

  return { order, whatsappUrl };
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderDoc> {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

function formatAddress(a: CreateOrderInput['shippingAddress']): string {
  return [a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
}

// ── Admin: listing, detail, status pipeline ──────────────────────────

/** Statuses at which stock is considered committed (deducted). */
const COMMIT_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
];

export interface OrderListQuery {
  page: number;
  limit: number;
  status?: OrderStatus;
  source?: string;
  search?: string;
}

export async function listOrders(
  query: OrderListQuery,
): Promise<{ items: OrderDoc[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  if (query.search) {
    const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.name': rx }];
  }

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(getSkip(query.page, query.limit))
      .limit(query.limit),
    Order.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
}

export async function getOrderById(id: string): Promise<OrderDoc> {
  const order = await Order.findById(id).populate('customer', 'name phone whatsapp email type');
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

/**
 * Change an order's status and apply the corresponding stock effect exactly
 * once: commit (deduct) stock on fulfilment, restock on cancel/return.
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  performedBy?: string,
): Promise<OrderDoc> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  const items = order.items as unknown as Array<{
    product: { toString(): string };
    variant: { toString(): string } | null;
    quantity: number;
  }>;

  if (COMMIT_STATUSES.includes(status) && !order.stockCommitted) {
    for (const item of items) {
       
      await commitSale(item.product.toString(), item.variant?.toString() ?? null, item.quantity, {
        reason: 'SALE',
        performedBy,
      });
    }
    order.set('stockCommitted', true);
  } else if (status === 'CANCELLED' || status === 'RETURNED') {
    if (order.stockCommitted) {
      for (const item of items) {
         
        await adjustStock(
          {
            product: item.product.toString(),
            variant: item.variant?.toString() ?? null,
            change: item.quantity,
            reason: 'RETURN',
            note: `Order ${order.orderNumber} ${status.toLowerCase()}`,
          },
          performedBy,
        );
      }
      order.set('stockCommitted', false);
    } else if (env.ORDER_RESERVE_STOCK) {
      await Promise.all(
        items.map((item) =>
          releaseReservation(item.product.toString(), item.variant?.toString() ?? null, item.quantity),
        ),
      );
    }
  }

  order.set('status', status);
  order.get('statusHistory').push({ status, at: new Date(), by: performedBy ?? null });
  await order.save();
  return order;
}
