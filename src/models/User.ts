import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { USER_ROLES } from '@taaj/shared';

/**
 * Admin / staff user. Storefront customers are NOT users (they order as guests
 * via WhatsApp) — see the Customer model. Refresh tokens are stored as SHA-256
 * hashes so sessions can be revoked and rotated without keeping raw tokens.
 */
const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'ADMIN' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  { timestamps: true },
);

// Never leak sensitive fields when serialized.
userSchema.set('toJSON', {
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.__v;
    return ret;
  },
});

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model('User', userSchema);
