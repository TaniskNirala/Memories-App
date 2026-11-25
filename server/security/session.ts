import crypto from 'crypto';
import type { Request, Response } from 'express';
import { run } from '../db.ts';
import { hashToken } from './tokens.ts';

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days, renewed while the user is active
export const SESSION_RENEW_BELOW_MS = 7 * 24 * 60 * 60 * 1000;

function sameSite(): 'lax' | 'strict' | 'none' {
  const v = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return v === 'strict' || v === 'none' ? v : 'lax';
}

export function setSessionCookie(req: Request, res: Response, token: string, expires: Date) {
  const ss = sameSite();
  res.cookie('kinfolk_session', token, {
    httpOnly: true,
    // SameSite=None requires Secure; otherwise only force Secure in production / over https
    secure: ss === 'none' || process.env.NODE_ENV === 'production' || req.secure,
    sameSite: ss,
    expires,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('kinfolk_session', { path: '/' });
}

/** Creates a session row (token stored hashed) and sets the httpOnly cookie. */
export function createSession(req: Request, res: Response, userId: string): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  run('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
    hashToken(token),
    userId,
    expiresAt.toISOString(),
    now.toISOString(),
  ]);
  setSessionCookie(req, res, token, expiresAt);
  return { token, expiresAt };
}
