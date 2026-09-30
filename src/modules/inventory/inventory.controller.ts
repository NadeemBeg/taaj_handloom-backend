import type { Request, Response } from 'express';
import * as service from './inventory.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse.js';
import type { TransactionsQuery } from './inventory.validators.js';

export const adjustHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.adjustStock(req.body, req.user!.id);
  sendSuccess(res, result, 'Stock adjusted');
});

export const transactionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await service.listTransactions(
    req.query as unknown as TransactionsQuery,
  );
  sendPaginated(res, items, meta, 'Inventory transactions fetched');
});

export const lowStockHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getLowStock();
  sendSuccess(res, data, 'Low-stock items fetched');
});
