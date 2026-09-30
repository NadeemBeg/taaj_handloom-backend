import { z } from 'zod';
import { USER_ROLES, objectIdSchema } from '@taaj/shared';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Creating a new admin user (SUPER_ADMIN only). */
export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  role: z.enum(USER_ROLES).default('ADMIN'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Updating an existing admin user (SUPER_ADMIN only). */
export const updateUserSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userParamsSchema = z.object({ id: objectIdSchema });
