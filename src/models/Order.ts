import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ORDER_STATUSES, PAYMENT_STATUSES, ORDER_SOURCES, PRICE_TYPES } from '@taaj/shared';
import { addressSchema } from './Customer.js';

/** Line item with immutable snapshot so historical orders never change. */
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    snapshot: {
      name: { type: String, required: true },
      sku: { type: String, required: true },
      color: { type: String },
      image: { type: String },
    },
    unitPrice: { type: Number, required: true },
    mrp: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
    priceType: { type: String, enum: PRICE_TYPES, default: 'RETAIL' },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    contact: {
      name: { type: String, required: true },
      phone: { type: String, required: true, index: true },
      whatsapp: { type: String },
      email: { type: String },
    },
    shippingAddress: { type: addressSchema, required: true },

    items: { type: [orderItemSchema], required: true },
    amounts: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    // Retail vs wholesale order (drives item pricing).
    customerType: { type: String, enum: ['INDIVIDUAL', 'WHOLESALE'], default: 'INDIVIDUAL', index: true },
    // Applied coupon, if any.
    coupon: {
      code: { type: String },
      discount: { type: Number },
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'NEW', index: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING' },
    source: { type: String, enum: ORDER_SOURCES, default: 'WEBSITE', index: true },

    notes: { type: String, default: '' },
    statusHistory: { type: [statusHistorySchema], default: [] },

    // True once stock has been deducted for this order (on fulfilment), so we
    // never double-commit or double-restock.
    stockCommitted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

export type OrderDoc = HydratedDocument<InferSchemaType<typeof orderSchema>>;

export const Order = model('Order', orderSchema);
