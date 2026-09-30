import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { imageSchema } from './Category.js';

/**
 * Singleton document holding business-editable site content: brand, contact,
 * WhatsApp number, announcement bar, socials and SEO defaults. Read publicly
 * (GET /settings) and edited from the admin. Never hardcode these in the apps.
 */
const websiteSettingSchema = new Schema(
  {
    // A fixed key keeps this collection a singleton.
    key: { type: String, default: 'site', unique: true, index: true },
    brand: {
      name: { type: String, default: 'TAAJ Handloom' },
      tagline: { type: String, default: 'Authentic Maheshwari Handloom from Maheshwar' },
      logo: { type: imageSchema },
    },
    whatsappNumber: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: {
      line1: { type: String, default: '' },
      city: { type: String, default: 'Maheshwar' },
      state: { type: String, default: 'Madhya Pradesh' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    social: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    announcement: {
      type: String,
      default: 'Authentic Maheshwari Handloom • Manufacturer • Wholesale • Retail',
    },
    seo: {
      title: { type: String, default: 'TAAJ Handloom — Authentic Maheshwari Handloom' },
      description: {
        type: String,
        default: 'Handwoven Maheshwari sarees, suits and chunari — direct from the looms of Maheshwar, Madhya Pradesh.',
      },
    },
    // Homepage section order & visibility (the hero is always shown).
    homeSections: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            enabled: { type: Boolean, default: true },
            order: { type: Number, default: 0 },
          },
          { _id: false },
        ),
      ],
      default: () =>
        [
          'categories',
          'featured',
          'charkha',
          'why',
          'newArrivals',
          'bestSellers',
          'wholesale',
          'social',
        ].map((key, i) => ({ key, enabled: true, order: i + 1 })),
    },
  },
  { timestamps: true },
);

websiteSettingSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.__v;
    return ret;
  },
});

export type WebsiteSettingDoc = HydratedDocument<InferSchemaType<typeof websiteSettingSchema>>;

export const WebsiteSetting = model('WebsiteSetting', websiteSettingSchema);
