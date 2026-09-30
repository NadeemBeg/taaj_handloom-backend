import type { Request, Response } from 'express';
import * as service from './banner.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import type { BannerType } from '@taaj/shared';

/** Public list — active banners only (optionally ?type=HERO). */
export const listPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const banners = await service.listActiveBanners(req.query.type as BannerType | undefined);
  sendSuccess(res, { banners }, 'Banners fetched');
});

/** Admin list — includes inactive/scheduled banners. */
export const listAdminHandler = asyncHandler(async (req: Request, res: Response) => {
  const banners = await service.listAllBanners(req.query.type as BannerType | undefined);
  sendSuccess(res, { banners }, 'Banners fetched');
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const banner = await service.createBanner(req.body);
  sendSuccess(res, { banner }, 'Banner created', 201);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const banner = await service.updateBanner(req.params.id, req.body);
  sendSuccess(res, { banner }, 'Banner updated');
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteBanner(req.params.id);
  sendSuccess(res, null, 'Banner deleted');
});
