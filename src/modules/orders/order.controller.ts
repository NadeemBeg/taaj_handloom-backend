import type { Request, Response } from 'express';
import * as service from './order.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const createOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const { order, whatsappUrl } = await service.createOrder(req.body);
  sendSuccess(
    res,
    { order: order.toJSON(), whatsappUrl },
    'Order placed — continue on WhatsApp',
    201,
  );
});

import { sendPaginated } from '../../utils/apiResponse.js';
import type { OrderListQuery } from './order.service.js';
import type { OrderStatus } from '@taaj/shared';

export const listOrdersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await service.listOrders(req.query as unknown as OrderListQuery);
  sendPaginated(res, items, meta, 'Orders fetched');
});

export const getOrderByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const order = await service.getOrderById(req.params.id);
  sendSuccess(res, { order: order.toJSON() }, 'Order fetched');
});

export const updateStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const order = await service.updateOrderStatus(
    req.params.id,
    req.body.status as OrderStatus,
    req.user!.id,
  );
  sendSuccess(res, { order: order.toJSON() }, 'Order status updated');
});

export const getOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const order = await service.getOrderByNumber(req.params.orderNumber);
  // Public endpoint: order numbers are guessable, so expose only a non-PII
  // summary (no contact/address). Full order is admin-only (Phase 7).
  const summary = {
    orderNumber: order.orderNumber,
    items: order.items,
    amounts: order.amounts,
    status: order.status,
    createdAt: (order as unknown as { createdAt: Date }).createdAt,
  };
  sendSuccess(res, { order: summary }, 'Order fetched');
});
