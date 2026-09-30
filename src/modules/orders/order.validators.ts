import { z } from 'zod';
import { objectIdSchema, phoneSchema, ORDER_STATUSES, ORDER_SOURCES } from '@taaj/shared';

const addressInputSchema = z.object({
  line1: z.string().trim().min(3, 'Address is required'),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  country: z.string().trim().default('India'),
});

export const createOrderSchema = z.object({
  contact: z.object({
    name: z.string().trim().min(2, 'Name is required'),
    phone: phoneSchema,
    whatsapp: phoneSchema.optional(),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  }),
  shippingAddress: addressInputSchema,
  items: z
    .array(
      z.object({
        product: objectIdSchema,
        variant: objectIdSchema.nullable().optional(),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1, 'At least one item is required'),
  customerType: z.enum(['individual', 'wholesale']).default('individual'),
  couponCode: z.string().trim().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderNumberParamsSchema = z.object({
  orderNumber: z.string().trim().min(3),
});

export const orderIdParamsSchema = z.object({ id: objectIdSchema });

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  search: z.string().trim().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});
