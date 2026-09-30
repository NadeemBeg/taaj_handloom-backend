import { z } from 'zod';
import { objectIdSchema, BANNER_TYPES } from '@taaj/shared';

const imageInputSchema = z.object({
  url: z.string().url('Image url must be valid'),
  publicId: z.string().optional(),
  alt: z.string().optional(),
});

export const createBannerSchema = z.object({
  type: z.enum(BANNER_TYPES).optional(),
  title: z.string().trim().optional(),
  subtitle: z.string().trim().optional(),
  desktopImage: imageInputSchema,
  mobileImage: imageInputSchema.optional(),
  ctaLabel: z.string().trim().optional(),
  ctaHref: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = createBannerSchema.partial();
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const bannerParamsSchema = z.object({ id: objectIdSchema });

export const bannerListQuerySchema = z.object({
  type: z.enum(BANNER_TYPES).optional(),
});
export type BannerListQuery = z.infer<typeof bannerListQuerySchema>;
