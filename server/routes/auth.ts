import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, checkLoginRateLimit, recordLoginAttempt, clearLoginAttempts } from '../middleware/auth.ts';

export const authRouter = Router();

// Immediately clear any prior locked attempts on server load
clearLoginAttempts();

function setSessionCookie(res: Response, token: string, expires: Date) {
  res.cookie('kinfolk_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    expires,
    path: '/',
  });
}

// Register
authRouter.post('/register', async (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Username, password and display name are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[a-z0-9_-]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric with - or _' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = queryOne<{ id: string }>('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const userCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  const isFirstUser = (userCount?.count || 0) === 0;
  const role = isFirstUser ? 'admin' : 'pending';

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const colors = ['#f59e0b', '#f43f5e', '#ec4899', '#06b6d4', '#10b981', '#8b5cf6', '#3b82f6'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];
  const now = new Date().toISOString();

  run(
    'INSERT INTO users (id, username, password_hash, display_name, role, status, avatar_color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, cleanUsername, passwordHash, displayName.trim(), role, 'active', avatarColor, now]
  );

  // If approved admin right away, ensure "Everyone" group exists and add them
  if (role === 'admin') {
    let everyone = queryOne<{ id: string }>('SELECT id FROM groups WHERE is_everyone = 1');
    if (!everyone) {
      const everyoneId = crypto.randomUUID();
      run(
        'INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        [everyoneId, 'Everyone', 'Automatic group containing all approved friends', userId, now]
      );
      everyone = { id: everyoneId };
    }
    run(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
      [everyone.id, userId, now]
    );
  } else {
    // Notify admins of new pending registration
    const admins = queryAll<{ id: string }>('SELECT id FROM users WHERE role = "admin"');
    for (const adm of admins) {
      run(
        'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [
          crypto.randomUUID(),
          adm.id,
          'new_signup',
          'New account pending approval',
          `@${cleanUsername} (${displayName.trim()}) registered and awaits your approval.`,
          '/admin',
          now,
        ]
      );
    }
  }

  // Create session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [sessionToken, userId, expiresAt.toISOString(), now]
  );

  setSessionCookie(res, sessionToken, expiresAt);

  return res.json({
    user: {
      id: userId,
      username: cleanUsername,
      displayName: displayName.trim(),
      role,
      status: 'active',
      avatarColor,
    },
    token: sessionToken,
    isPending: role === 'pending',
  });
});

// Login
authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  const user = queryOne<{
    id: string;
    username: string;
    password_hash: string;
    display_name: string;
    role: string;
    status: string;
    avatar_color: string;
  }>('SELECT * FROM users WHERE username = ?', [cleanUsername]);

  if (!user) {
    recordLoginAttempt(ip, cleanUsername, false);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    recordLoginAttempt(ip, cleanUsername, false);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Successful login
  recordLoginAttempt(ip, cleanUsername, true);

  if (user.status === 'suspended') {
    return res.status(403).json({
      error: 'Your account has been suspended by an administrator.',
      isSuspended: true,
    });
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date().toISOString();

  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [sessionToken, user.id, expiresAt.toISOString(), now]
  );

  setSessionCookie(res, sessionToken, expiresAt);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      avatarColor: user.avatar_color,
    },
    token: sessionToken,
    isPending: user.role === 'pending',
  });
});

// Quick switch user endpoint for prototype demo
authRouter.post('/switch-user', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cleanUsername = username.trim().toLowerCase();
  const user = queryOne<any>('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date().toISOString();

  run(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [sessionToken, user.id, expiresAt.toISOString(), now]
  );

  setSessionCookie(res, sessionToken, expiresAt);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      avatarColor: user.avatar_color,
    },
    token: sessionToken,
    isPending: user.role === 'pending',
  });
});

// Logout
authRouter.post('/logout', (req: AuthenticatedRequest, res) => {
  const token = req.cookies?.kinfolk_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    run('DELETE FROM sessions WHERE token = ?', [token]);
  }
  res.clearCookie('kinfolk_session', { path: '/' });
  res.json({ success: true });
});

// Current user
authRouter.get('/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  res.json({
    user: req.user,
    isPending: req.user.role === 'pending',
    isSuspended: req.user.status === 'suspended',
    isAdmin: req.user.role === 'admin',
  });
});

// Redeem one-time password reset link
authRouter.post('/redeem-reset', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Valid reset token and password (min 6 chars) required' });
  }

  const resetRecord = queryOne<{
    token: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>('SELECT * FROM password_resets WHERE token = ?', [token]);

  if (!resetRecord) {
    return res.status(400).json({ error: 'Invalid or expired password reset link' });
  }

  if (resetRecord.used_at) {
    return res.status(400).json({ error: 'This reset link has already been used' });
  }

  if (new Date(resetRecord.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const now = new Date().toISOString();

  run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRecord.user_id]);
  run('UPDATE password_resets SET used_at = ? WHERE token = ?', [now, token]);
  // Invalidate any old sessions
  run('DELETE FROM sessions WHERE user_id = ?', [resetRecord.user_id]);

  res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
});
