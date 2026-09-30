import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { imageSchema } from './Category.js';

/** Stock counters embedded on a product (when it has no variants) or a variant. */
export const stockSchema = new Schema(
  {
    quantity: { type: Number, required: true, default: 0, min: 0 },
    reserved: { type: Number, required: true, default: 0, min: 0 },
    sold: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, required: true, default: 3, min: 0 },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    mrp: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    minWholesaleQty: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

/**
 * Core product. Colors/sizes are ProductVariant documents (not separate
 * products). When `hasVariants` is false, `baseStock` is the stock source of
 * truth; otherwise variants hold stock.
 */
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },

    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },

    shortDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    careInstructions: { type: String, default: '' },

    pricing: { type: pricingSchema, required: true },

    attributes: {
      fabric: { type: String, index: true },
      material: { type: String },
      pattern: { type: String, index: true },
      occasion: { type: [String], default: [] },
      tags: { type: [String], default: [] },
    },

    media: {
      mainImage: { type: imageSchema, required: true },
      gallery: { type: [imageSchema], default: [] },
      video: { type: imageSchema },
    },

    flags: {
      isFeatured: { type: Boolean, default: false, index: true },
      isBestSeller: { type: Boolean, default: false, index: true },
      isNewArrival: { type: Boolean, default: true, index: true },
      isActive: { type: Boolean, default: true, index: true },
    },

    hasVariants: { type: Boolean, default: false },
    baseStock: { type: stockSchema, default: () => ({}) },

    salesCount: { type: Number, default: 0, index: true }, // for "popular"/"best selling" sort

    seo: {
      title: { type: String },
      description: { type: String },
    },
  },
  { timestamps: true },
);

// Full-text search across name, sku, tags, fabric, pattern.
productSchema.index({
  name: 'text',
  sku: 'text',
  'attributes.tags': 'text',
  'attributes.fabric': 'text',
  'attributes.pattern': 'text',
});

// Common list sorts/filters.
productSchema.index({ 'pricing.price': 1 });
productSchema.index({ createdAt: -1 });

productSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type ProductDoc = HydratedDocument<InferSchemaType<typeof productSchema>>;

export const Product = model('Product', productSchema);
