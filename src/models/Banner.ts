import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { BANNER_TYPES } from '@taaj/shared';
import { imageSchema } from './Category.js';

/**
 * Homepage banner — hero slides and content strips managed from the admin CMS.
 * A HERO banner carries desktop + mobile art, heading/subheading and a CTA.
 * Scheduling is optional via startsAt / endsAt; sortOrder drives slide order.
 */
const bannerSchema = new Schema(
  {
    type: { type: String, enum: BANNER_TYPES, default: 'HERO', index: true },
    title: { type: String, trim: true, default: '' },
    subtitle: { type: String, trim: true, default: '' },
    desktopImage: { type: imageSchema, required: true },
    mobileImage: { type: imageSchema },
    ctaLabel: { type: String, trim: true, default: '' },
    ctaHref: { type: String, trim: true, default: '' },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
  },
  { timestamps: true },
);

bannerSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type BannerDoc = HydratedDocument<InferSchemaType<typeof bannerSchema>>;

export const Banner = model('Banner', bannerSchema);
