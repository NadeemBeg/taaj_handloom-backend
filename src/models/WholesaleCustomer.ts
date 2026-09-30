import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Wholesale profile attached to a Customer. Kept separate so wholesale login
 * and special pricing can be added later without touching the Customer model.
 */
const wholesaleCustomerSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
    businessName: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true },
    minOrderQty: { type: Number, default: 1, min: 1 },
    notes: { type: String, default: '' },
    isApproved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type WholesaleCustomerDoc = HydratedDocument<
  InferSchemaType<typeof wholesaleCustomerSchema>
>;

export const WholesaleCustomer = model('WholesaleCustomer', wholesaleCustomerSchema);
