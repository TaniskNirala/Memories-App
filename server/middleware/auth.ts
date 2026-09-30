import { Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, run } from '../db.ts';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member' | 'pending';
  status: 'active' | 'suspended';
  avatarColor: string;
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
    const session = queryOne<{ token: string; user_id: string; expires_at: string }>(
      'SELECT token, user_id, expires_at FROM sessions WHERE token = ?',
      [token]
    );

    if (!session) {
      return next();
    }

    if (new Date(session.expires_at) < new Date()) {
      run('DELETE FROM sessions WHERE token = ?', [token]);
      return next();
    }

    const user = queryOne<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      status: string;
      avatar_color: string;
    }>(
      'SELECT id, username, display_name, role, status, avatar_color FROM users WHERE id = ?',
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
      };
      req.token = token;
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

export function checkLoginRateLimit(_ip: string, _username: string): boolean {
  // Rate limiting wait removed per user request
  return true;
}

export function clearLoginAttempts(): void {
  try {
    run('DELETE FROM login_attempts');
  } catch (e) {}
}

export function recordLoginAttempt(ip: string, username: string, success: boolean): void {
  const id = crypto.randomUUID();
  run(
    'INSERT INTO login_attempts (id, ip, username, success, attempted_at) VALUES (?, ?, ?, ?, ?)',
    [id, ip, username.toLowerCase(), success ? 1 : 0, new Date().toISOString()]
  );
}
