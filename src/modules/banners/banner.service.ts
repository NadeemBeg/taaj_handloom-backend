import type { FilterQuery } from 'mongoose';
import { Banner, type BannerDoc } from '../../models/Banner.js';
import { ApiError } from '../../utils/ApiError.js';
import type { BannerType } from '@taaj/shared';
import type { CreateBannerInput, UpdateBannerInput } from './banner.validators.js';

/** Public: active banners of a type, within their schedule window, ordered. */
export async function listActiveBanners(type?: BannerType): Promise<BannerDoc[]> {
  const now = new Date();
  const filter: FilterQuery<BannerDoc> = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (type) filter.type = type;
  return Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 });
}

/** Admin: all banners (optionally filtered by type), including inactive. */
export async function listAllBanners(type?: BannerType): Promise<BannerDoc[]> {
  const filter: FilterQuery<BannerDoc> = type ? { type } : {};
  return Banner.find(filter).sort({ type: 1, sortOrder: 1, createdAt: -1 });
}

export async function createBanner(input: CreateBannerInput): Promise<BannerDoc> {
  return Banner.create(input);
}

export async function updateBanner(id: string, input: UpdateBannerInput): Promise<BannerDoc> {
  const banner = await Banner.findByIdAndUpdate(id, input, { new: true });
  if (!banner) throw ApiError.notFound('Banner not found');
  return banner;
}

export async function deleteBanner(id: string): Promise<void> {
  const deleted = await Banner.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Banner not found');
}
