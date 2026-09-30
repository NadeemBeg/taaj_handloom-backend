import type { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearRefreshCookieOptions,
} from '../../config/cookies.js';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(maxAge));
}

function readRefreshCookie(req: Request): string | undefined {
  return req.signedCookies?.[REFRESH_COOKIE_NAME];
}

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.login(req.body);
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  sendSuccess(res, { user: user.toJSON(), accessToken: tokens.accessToken }, 'Signed in');
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const presented = readRefreshCookie(req);
  if (!presented) throw ApiError.unauthorized('No active session');
  const { user, tokens } = await authService.refresh(presented);
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  sendSuccess(res, { user: user.toJSON(), accessToken: tokens.accessToken }, 'Session refreshed');
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const presented = readRefreshCookie(req);
  await authService.logout(presented);
  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
  sendSuccess(res, null, 'Signed out');
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUserById(req.user!.id);
  sendSuccess(res, { user: user.toJSON() }, 'Current user');
});

export const createUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.createUser(req.body);
  sendSuccess(res, { user: user.toJSON() }, 'User created', 201);
});

export const listUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await authService.listUsers();
  sendSuccess(res, { users: users.map((u) => u.toJSON()) }, 'Users fetched');
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  // Guard against self-lockout: a super admin cannot demote or deactivate themselves.
  if (req.params.id === req.user!.id && (req.body.role !== undefined || req.body.isActive === false)) {
    throw ApiError.badRequest('You cannot change your own role or deactivate your own account');
  }
  const user = await authService.updateUser(req.params.id, req.body);
  sendSuccess(res, { user: user.toJSON() }, 'User updated');
});
