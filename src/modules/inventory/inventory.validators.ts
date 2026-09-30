import { z } from 'zod';
import { objectIdSchema, INVENTORY_REASONS } from '@taaj/shared';

export const adjustStockSchema = z.object({
  product: objectIdSchema,
  variant: objectIdSchema.nullable().optional(),
  change: z
    .number()
    .int('Change must be a whole number')
    .refine((n) => n !== 0, 'Change cannot be zero'),
  reason: z.enum(INVENTORY_REASONS),
  note: z.string().max(500).optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  product: objectIdSchema.optional(),
  variant: objectIdSchema.optional(),
  reason: z.enum(INVENTORY_REASONS).optional(),
});
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
