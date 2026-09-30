import { User, type UserDoc } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  type RefreshTokenPayload,
} from '../../utils/jwt.js';
import type { CreateUserInput, LoginInput, UpdateUserInput } from './auth.validators.js';
import type { UserRole } from '@taaj/shared';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Issue an access + refresh pair and persist the refresh hash on the user. */
async function issueTokens(user: UserDoc): Promise<IssuedTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role as UserRole });
  const { token: refreshToken } = signRefreshToken(user.id);

  const decoded = verifyRefreshToken(refreshToken) as RefreshTokenPayload & { exp: number };
  const refreshExpiresAt = new Date(decoded.exp * 1000);

  // Persist hash; prune expired entries to keep the array small.
  const now = new Date();
  user.set('refreshTokens', [
    ...(user.get('refreshTokens') ?? []).filter((t: { expiresAt: Date }) => t.expiresAt > now),
    { tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
  ]);
  await user.save();

  return { accessToken, refreshToken, refreshExpiresAt };
}

export async function login(input: LoginInput): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash +refreshTokens');
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const ok = await verifyPassword(input.password, user.get('passwordHash'));
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.set('lastLoginAt', new Date());
  const tokens = await issueTokens(user);
  return { user, tokens };
}

/** Rotate: validate the presented refresh token, revoke it, and issue a fresh pair. */
export async function refresh(
  presentedToken: string,
): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
  let payload;
  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired session');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid or expired session');

  const presentedHash = hashToken(presentedToken);
  const stored = (user.get('refreshTokens') ?? []) as Array<{ tokenHash: string; expiresAt: Date }>;
  const match = stored.find((t) => t.tokenHash === presentedHash);

  if (!match) {
    // Token not recognised — possible reuse/theft. Revoke all sessions.
    user.set('refreshTokens', []);
    await user.save();
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  // Remove the used token (rotation) before issuing a new one.
  user.set(
    'refreshTokens',
    stored.filter((t) => t.tokenHash !== presentedHash),
  );

  const tokens = await issueTokens(user);
  return { user, tokens };
}

/** Revoke a single refresh token (logout on this device). */
export async function logout(presentedToken?: string): Promise<void> {
  if (!presentedToken) return;
  let payload;
  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    return; // already invalid — nothing to revoke
  }
  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user) return;
  const presentedHash = hashToken(presentedToken);
  const stored = (user.get('refreshTokens') ?? []) as Array<{ tokenHash: string }>;
  user.set(
    'refreshTokens',
    stored.filter((t) => t.tokenHash !== presentedHash),
  );
  await user.save();
}

export async function createUser(input: CreateUserInput): Promise<UserDoc> {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash,
  });
  return user;
}

export async function getUserById(id: string): Promise<UserDoc> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function listUsers(): Promise<UserDoc[]> {
  return User.find().sort({ createdAt: 1 });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDoc> {
  const user = await User.findByIdAndUpdate(id, input, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}
