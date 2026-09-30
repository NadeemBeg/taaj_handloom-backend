import { z } from 'zod';
import { objectIdSchema, PRODUCT_COLOR_NAMES } from '@taaj/shared';
import { imageInputSchema } from '../categories/category.validators.js';

const stockInputSchema = z.object({
  quantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(3),
});

const pricingInputSchema = z
  .object({
    mrp: z.number().min(0),
    price: z.number().min(0),
    wholesalePrice: z.number().min(0).optional(),
    minWholesaleQty: z.number().int().min(1).default(1),
  })
  .refine((p) => p.price <= p.mrp, {
    message: 'Selling price cannot exceed MRP',
    path: ['price'],
  });

const attributesInputSchema = z.object({
  fabric: z.string().optional(),
  material: z.string().optional(),
  pattern: z.string().optional(),
  occasion: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional(),
  sku: z.string().trim().min(2),
  category: objectIdSchema,
  subcategory: objectIdSchema.nullable().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  careInstructions: z.string().optional(),
  pricing: pricingInputSchema,
  attributes: attributesInputSchema.optional(),
  media: z.object({
    mainImage: imageInputSchema,
    gallery: z.array(imageInputSchema).default([]),
    video: imageInputSchema.optional(),
  }),
  flags: z
    .object({
      isFeatured: z.boolean().optional(),
      isBestSeller: z.boolean().optional(),
      isNewArrival: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .optional(),
  hasVariants: z.boolean().optional(),
  baseStock: stockInputSchema.optional(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productParamsSchema = z.object({ id: objectIdSchema });
export const productSlugSchema = z.object({ slug: z.string().trim().min(1) });

/** ---- Variants ---- */
export const createVariantSchema = z.object({
  sku: z.string().trim().min(2),
  color: z.object({
    name: z.string().trim().min(1),
    hex: z.string().optional(),
  }),
  size: z.string().optional(),
  price: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  wholesalePrice: z.number().min(0).optional(),
  stock: stockInputSchema.optional(),
  images: z.array(imageInputSchema).default([]),
  isActive: z.boolean().optional(),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema.partial();
export const variantParamsSchema = z.object({ variantId: objectIdSchema });

/** ---- Public catalog query (filter + sort + paginate) ---- */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  category: z.string().optional(), // slug or id
  subcategory: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  color: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isNewArrival: z.coerce.boolean().optional(),
  isBestSeller: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  hasDiscount: z.coerce.boolean().optional(),
  fabric: z.string().optional(),
  pattern: z.string().optional(),
  occasion: z.string().optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'popular', 'best_selling'])
    .default('newest'),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const COLOR_NAME_SET = new Set(PRODUCT_COLOR_NAMES);
