import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { imageSchema } from './Category.js';
import { stockSchema } from './Product.js';

/**
 * A product variant (typically a color, optionally a size). Price fields are
 * optional overrides — when absent, the parent product's pricing applies.
 * Colors are variants of ONE product, never separate products.
 */
const productVariantSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },

    color: {
      name: { type: String, required: true, index: true },
      hex: { type: String },
    },
    size: { type: String },

    // Optional per-variant price overrides.
    price: { type: Number, min: 0 },
    mrp: { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },

    stock: { type: stockSchema, default: () => ({}) },
    images: { type: [imageSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

productVariantSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type ProductVariantDoc = HydratedDocument<InferSchemaType<typeof productVariantSchema>>;

export const ProductVariant = model('ProductVariant', productVariantSchema);
