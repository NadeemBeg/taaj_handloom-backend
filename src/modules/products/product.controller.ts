import type { Request, Response } from 'express';
import * as service from './product.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse.js';
import type { ProductListQuery } from './product.validators.js';

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.user != null && req.query.includeInactive === 'true';
  const { items, meta } = await service.listProducts(
    req.query as unknown as ProductListQuery,
    { includeInactive },
  );
  sendPaginated(res, items, meta, 'Products fetched');
});

export const getBySlugHandler = asyncHandler(async (req: Request, res: Response) => {
  const { product, variants } = await service.getProductBySlug(req.params.slug);
  sendSuccess(res, { product, variants }, 'Product fetched');
});

export const searchHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q);
  const limit = Number(req.query.limit ?? 8);
  const results = await service.searchProducts(q, limit);
  sendSuccess(res, { results }, 'Search results');
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const product = await service.createProduct(req.body);
  sendSuccess(res, { product }, 'Product created', 201);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const product = await service.updateProduct(req.params.id, req.body);
  sendSuccess(res, { product }, 'Product updated');
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteProduct(req.params.id);
  sendSuccess(res, null, 'Product deleted');
});

// ── variants ──
export const listVariantsHandler = asyncHandler(async (req: Request, res: Response) => {
  const variants = await service.listVariants(req.params.id);
  sendSuccess(res, { variants }, 'Variants fetched');
});

export const addVariantHandler = asyncHandler(async (req: Request, res: Response) => {
  const variant = await service.addVariant(req.params.id, req.body);
  sendSuccess(res, { variant }, 'Variant added', 201);
});

export const updateVariantHandler = asyncHandler(async (req: Request, res: Response) => {
  const variant = await service.updateVariant(req.params.variantId, req.body);
  sendSuccess(res, { variant }, 'Variant updated');
});

export const deleteVariantHandler = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteVariant(req.params.variantId);
  sendSuccess(res, null, 'Variant deleted');
});
