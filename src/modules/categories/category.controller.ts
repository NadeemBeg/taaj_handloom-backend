import type { Request, Response } from 'express';
import * as service from './category.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  // Admins may request inactive categories via ?includeInactive=true
  const includeInactive = req.user != null && req.query.includeInactive === 'true';
  const categories = await service.listCategories({ includeInactive });
  sendSuccess(res, { categories }, 'Categories fetched');
});

export const getBySlugHandler = asyncHandler(async (req: Request, res: Response) => {
  const category = await service.getCategoryBySlug(req.params.slug);
  sendSuccess(res, { category }, 'Category fetched');
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const category = await service.createCategory(req.body);
  sendSuccess(res, { category }, 'Category created', 201);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const category = await service.updateCategory(req.params.id, req.body);
  sendSuccess(res, { category }, 'Category updated');
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCategory(req.params.id);
  sendSuccess(res, null, 'Category deleted');
});
