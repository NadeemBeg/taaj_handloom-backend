import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CUSTOMER_TYPES } from '@taaj/shared';

export const addressSchema = new Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' },
  },
  { _id: false },
);

/**
 * Storefront customer (guest-first — created/updated at order time, keyed by
 * phone). Not an auth user. Wholesale login can attach later without rework.
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, index: true },
    whatsapp: { type: String },
    email: { type: String, lowercase: true, trim: true, index: true },
    addresses: { type: [addressSchema], default: [] },
    type: { type: String, enum: CUSTOMER_TYPES, default: 'INDIVIDUAL', index: true },
    notes: { type: String, default: '' },
    orderCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>;

export const Customer = model('Customer', customerSchema);
