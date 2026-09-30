/**
 * Central enumerations shared by backend, storefront, and admin.
 * Keep these as the single source of truth — Mongoose schemas, Zod
 * validators, and UI dropdowns all derive from here.
 */

export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER', 'ORDER_MANAGER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CUSTOMER_TYPES = ['INDIVIDUAL', 'RETAIL', 'WHOLESALE'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const ORDER_STATUSES = [
  'NEW',
  'WHATSAPP_CONTACTED',
  'CONFIRMED',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_SOURCES = ['WEBSITE', 'WHATSAPP', 'ADMIN', 'INSTAGRAM', 'OTHER'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const PRICE_TYPES = ['RETAIL', 'WHOLESALE'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const INVENTORY_REASONS = [
  'NEW_STOCK',
  'SALE',
  'RETURN',
  'DAMAGE',
  'MANUAL_CORRECTION',
  'MANUFACTURING',
  'WHOLESALE_ORDER',
] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

export const COUPON_TYPES = ['PERCENT', 'FLAT'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const BANNER_TYPES = ['HERO', 'STRIP', 'CATEGORY_TILE', 'CTA'] as const;
export type BannerType = (typeof BANNER_TYPES)[number];

/** Base product categories for TAAJ Handloom (extensible via DB). */
export const BASE_CATEGORIES = ['saree', 'suit', 'chunari'] as const;
export type BaseCategory = (typeof BASE_CATEGORIES)[number];
