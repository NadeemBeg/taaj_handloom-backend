import { z } from 'zod';
import { objectIdSchema } from '@taaj/shared';

export const imageInputSchema = z.object({
  url: z.string().url('Image url must be valid'),
  publicId: z.string().optional(),
  alt: z.string().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional(), // auto-generated from name if omitted
  description: z.string().optional(),
  image: imageInputSchema.optional(),
  parent: objectIdSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryParamsSchema = z.object({ id: objectIdSchema });
export const categorySlugSchema = z.object({ slug: z.string().trim().min(1) });
