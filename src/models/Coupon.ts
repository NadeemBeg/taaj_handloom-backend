import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { COUPON_TYPES } from '@taaj/shared';

/** Discount coupon. Admin-managed; application to carts is a future enhancement. */
const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    type: { type: String, enum: COUPON_TYPES, default: 'PERCENT' },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    startsAt: { type: Date },
    endsAt: { type: Date },
    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    appliesTo: {
      categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

couponSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type CouponDoc = HydratedDocument<InferSchemaType<typeof couponSchema>>;

export const Coupon = model('Coupon', couponSchema);
