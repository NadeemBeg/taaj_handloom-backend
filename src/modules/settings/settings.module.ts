import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { WebsiteSetting, type WebsiteSettingDoc } from '../../models/WebsiteSetting.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { env } from '../../config/env.js';

// ── service ────────────────────────────────────────────────────────────
/** Get the singleton settings doc, creating it (seeded from env) if absent. */
export async function getSettings(): Promise<WebsiteSettingDoc> {
  const existing = await WebsiteSetting.findOne({ key: 'site' });
  if (existing) return existing;
  return WebsiteSetting.create({ key: 'site', whatsappNumber: env.WHATSAPP_NUMBER ?? '' });
}

export async function updateSettings(patch: Record<string, unknown>): Promise<WebsiteSettingDoc> {
  return WebsiteSetting.findOneAndUpdate({ key: 'site' }, { $set: patch }, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
}

// ── validation ─────────────────────────────────────────────────────────
const imageInput = z.object({ url: z.string().url(), publicId: z.string().optional(), alt: z.string().optional() });
const updateSettingsSchema = z
  .object({
    brand: z
      .object({ name: z.string().optional(), tagline: z.string().optional(), logo: imageInput.optional() })
      .optional(),
    whatsappNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().or(z.literal('')).optional(),
    address: z
      .object({
        line1: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
        country: z.string().optional(),
      })
      .optional(),
    social: z
      .object({
        instagram: z.string().optional(),
        facebook: z.string().optional(),
        youtube: z.string().optional(),
      })
      .optional(),
    announcement: z.string().optional(),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
    homeSections: z
      .array(z.object({ key: z.string(), enabled: z.boolean(), order: z.number().int() }))
      .optional(),
  })
  .strict();

// ── controller + routes ────────────────────────────────────────────────
const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const settings = await getSettings();
    sendSuccess(res, { settings }, 'Settings fetched');
  }),
);

router.patch(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const settings = await updateSettings(req.body);
    sendSuccess(res, { settings }, 'Settings updated');
  }),
);

export default router;
