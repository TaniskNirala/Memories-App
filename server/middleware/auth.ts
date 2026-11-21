import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, run } from '../db.ts';
import { hashToken } from '../security/tokens.ts';
import { SESSION_TTL_MS, SESSION_RENEW_BELOW_MS, setSessionCookie } from '../security/session.ts';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member' | 'pending';
  status: 'active' | 'suspended';
  avatarColor: string;
  /** Uploaded profile photo URL, resolved from the stored storage key */
  avatarUrl?: string;
  /** 'dark' | 'light' | undefined (never chosen / new account) */
  themePreference?: 'dark' | 'light';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  token?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    token = req.cookies?.kinfolk_session;
  }

  if (!token) {
    return next();
  }

  try {
    const tokenHash = hashToken(token);
    const session = queryOne<{ token: string; user_id: string; expires_at: string }>(
      'SELECT token, user_id, expires_at FROM sessions WHERE token = ?',
      [tokenHash]
    );

    if (!session) {
      return next();
    }

    const expiresMs = new Date(session.expires_at).getTime();
    if (expiresMs < Date.now()) {
      run('DELETE FROM sessions WHERE token = ?', [tokenHash]);
      return next();
    }

    const user = queryOne<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      status: string;
      avatar_color: string;
      avatar_url: string | null;
      theme_preference: string | null;
    }>(
      'SELECT id, username, display_name, role, status, avatar_color, avatar_url, theme_preference FROM users WHERE id = ?',
      [session.user_id]
    );

    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role as any,
        status: user.status as any,
        avatarColor: user.avatar_color || '#f59e0b',
        avatarUrl: user.avatar_url
          ? `/api/storage/view?key=${encodeURIComponent(user.avatar_url)}`
          : undefined,
        themePreference:
          user.theme_preference === 'dark' || user.theme_preference === 'light'
            ? user.theme_preference
            : undefined,
      };
      req.token = token;

      // Sliding expiry: renew active sessions once less than half the lifetime remains
      if (expiresMs - Date.now() < SESSION_RENEW_BELOW_MS) {
        const renewed = new Date(Date.now() + SESSION_TTL_MS);
        run('UPDATE sessions SET expires_at = ? WHERE token = ?', [renewed.toISOString(), tokenHash]);
        if (req.cookies?.kinfolk_session === token) setSessionCookie(req, res, token, renewed);
      }
    }
  } catch (err) {
    console.error('Error verifying session:', err);
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireApproved(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account has been suspended by an administrator.', isSuspended: true });
  }

  if (req.user.role === 'pending') {
    return res.status(403).json({ error: 'Your account is pending admin approval. You cannot access shared memories yet.', isPending: true });
  }

  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

const WINDOW_MS = 15 * 60 * 1000;

function failuresSince(column: 'ip' | 'username' | 'both', ip: string, username: string): number {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let row: { c: number } | null | undefined;
  if (column === 'both') {
    row = queryOne<{ c: number }>(
      'SELECT COUNT(*) as c FROM login_attempts WHERE success = 0 AND ip = ? AND username = ? AND attempted_at > ?',
      [ip, username.toLowerCase(), since]
    );
  } else if (column === 'ip') {
    row = queryOne<{ c: number }>(
      'SELECT COUNT(*) as c FROM login_attempts WHERE success = 0 AND ip = ? AND attempted_at > ?',
      [ip, since]
    );
  } else {
    row = queryOne<{ c: number }>(
      'SELECT COUNT(*) as c FROM login_attempts WHERE success = 0 AND username = ? AND attempted_at > ?',
      [username.toLowerCase(), since]
    );
  }
  return row?.c || 0;
}

/** Returns false when the login should be refused because of too many recent failures. */
export function checkLoginRateLimit(ip: string, username: string): boolean {
  try {
    if (failuresSince('both', ip, username) >= 5) return false; // same client hammering one account
    if (failuresSince('ip', ip, username) >= 30) return false; // one client spraying many accounts
    if (failuresSince('username', ip, username) >= 20) return false; // distributed attack on one account
  } catch (e) {
    console.error('Login rate-limit check failed:', e);
  }
  return true;
}

/** Drops attempt records older than 24h (called on boot). Recent failures are kept so a restart cannot reset limits. */
export function clearLoginAttempts(): void {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    run('DELETE FROM login_attempts WHERE attempted_at < ?', [cutoff]);
  } catch (e) {}
}

export function clearFailedAttempts(ip: string, username: string): void {
  try {
    run('DELETE FROM login_attempts WHERE success = 0 AND ip = ? AND username = ?', [ip, username.toLowerCase()]);
  } catch (e) {}
}

export function recordLoginAttempt(ip: string, username: string, success: boolean): void {
  const id = crypto.randomUUID();
  run(
    'INSERT INTO login_attempts (id, ip, username, success, attempted_at) VALUES (?, ?, ?, ?, ?)',
    [id, ip, username.toLowerCase(), success ? 1 : 0, new Date().toISOString()]
  );
}
