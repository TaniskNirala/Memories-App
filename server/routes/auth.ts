import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, checkLoginRateLimit, recordLoginAttempt, clearLoginAttempts, clearFailedAttempts } from '../middleware/auth.ts';
import { getStorageAdapter } from '../storage/index.ts';
import { createRateLimiter } from '../security/rateLimit.ts';
import { avatarUrlFor } from '../security/avatars.ts';
import { validatePassword, hashPassword, needsRehash, DUMMY_HASH } from '../security/passwords.ts';
import { hashToken } from '../security/tokens.ts';
import { createSession, clearSessionCookie } from '../security/session.ts';

const PALETTE = [
  '#f6b544',
  '#ff7069',
  '#5eead4',
  '#9b9bff',
  '#34d399',
  '#f472b6',
  '#38bdf8',
  '#fb923c',
  '#a3e635',
  '#c084fc',
];

export const authRouter = Router();

// Prune old login attempts on boot (recent failures are kept so a restart cannot reset rate limits)
clearLoginAttempts();

/* --------------------------------------------------------------- avatar upload
   Small, image-only multipart upload. Files land next to post media so the
   existing /api/storage/view access rules keep working; only a 2 MB image is
   accepted and the stored key is what the user row keeps. */
const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => {
      const ext = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase())
        ? path.extname(file.originalname).toLowerCase()
        : '.jpg';
      cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});

// Multer failures must surface as JSON (a bare 500 HTML page breaks the UI)
function handleAvatarUpload(req: any, res: any, next: any) {
  avatarUpload.single('avatar')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'That image is larger than 2 MB — pick a smaller one.'
            : 'Could not upload that image.',
      });
    }
    return res.status(400).json({ error: 'Could not upload that image.' });
  });
}

/** Only the two supported palettes are ever persisted or returned. */
function normaliseTheme(value: unknown): 'dark' | 'light' | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-up attempts. Please try again later.' });
const redeemLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts. Please try again later.' });
const sensitiveLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => (req as AuthenticatedRequest).user?.id || req.ip || 'unknown',
  message: 'Too many attempts. Please try again later.',
});

// Register
authRouter.post('/register', registerLimiter, async (req, res) => {
  const { username, password, displayName } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || typeof displayName !== 'string' || !username || !password || !displayName.trim()) {
    return res.status(400).json({ error: 'Username, password and display name are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[a-z0-9_-]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric with - or _' });
  }

  const pwError = validatePassword(password, cleanUsername);
  if (pwError) {
    return res.status(400).json({ error: pwError });
  }
  if (displayName.trim().length > 60) {
    return res.status(400).json({ error: 'Display name must be 60 characters or fewer' });
  }

  const existing = queryOne<{ id: string }>('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const userCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  const isFirstUser = (userCount?.count || 0) === 0;

  // The very first account only becomes admin when explicitly allowed:
  //  - BOOTSTRAP_ADMIN_USERNAME must match the username being registered, or
  //  - (non-production only) no variable is set, which keeps local development convenient.
  // Everyone else is created as 'pending' and must be approved by an admin.
  let role: 'admin' | 'pending' = 'pending';
  if (isFirstUser) {
    const bootstrap = (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim().toLowerCase();
    if (bootstrap) {
      if (bootstrap === cleanUsername) role = 'admin';
    } else if (process.env.NODE_ENV !== 'production') {
      role = 'admin';
    } else {
      return res.status(503).json({
        error: 'Initial setup required: the server owner must set BOOTSTRAP_ADMIN_USERNAME before the first account can be created.',
      });
    }
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
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
    const admins = queryAll<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
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

  // Create session (token lives only in the httpOnly cookie; it is not returned in the body)
  createSession(req, res, userId);

  return res.json({
    user: {
      id: userId,
      username: cleanUsername,
      displayName: displayName.trim(),
      role,
      status: 'active',
      avatarColor,
    },
    isPending: role === 'pending',
  });
});

// Login
authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  if (!checkLoginRateLimit(ip, cleanUsername)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Too many failed login attempts. Please wait 15 minutes and try again.' });
  }

  const user = queryOne<{
    id: string;
    username: string;
    password_hash: string;
    display_name: string;
    role: string;
    status: string;
    avatar_color: string;
  }>('SELECT * FROM users WHERE username = ?', [cleanUsername]);

  // Always run bcrypt so response time does not reveal whether the username exists
  const isValid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !isValid) {
    recordLoginAttempt(ip, cleanUsername, false);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Successful login
  clearFailedAttempts(ip, cleanUsername);
  recordLoginAttempt(ip, cleanUsername, true);

  if (user.status === 'suspended') {
    return res.status(403).json({
      error: 'Your account has been suspended by an administrator.',
      isSuspended: true,
    });
  }

  // Transparently upgrade old, cheaper hashes
  if (needsRehash(user.password_hash)) {
    try {
      run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), user.id]);
    } catch {}
  }

  createSession(req, res, user.id);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
      avatarColor: user.avatar_color,
      avatarUrl: avatarUrlFor((user as any).avatar_url),
      themePreference: normaliseTheme((user as any).theme_preference),
    },
    isPending: user.role === 'pending',
  });
});

// Logout
authRouter.post('/logout', (req: AuthenticatedRequest, res) => {
  const token = req.cookies?.kinfolk_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    run('DELETE FROM sessions WHERE token = ?', [hashToken(token)]);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

// Log out everywhere (all devices)
authRouter.post('/logout-all', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
  clearSessionCookie(res);
  res.json({ success: true });
});

// Update own profile (display name, username, avatar colour)
authRouter.patch('/me', sensitiveLimiter, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { displayName, username, avatarColor, currentPassword, removeAvatar, themePreference } = req.body || {};
  const touchesIdentity = typeof username === 'string' && username.trim().toLowerCase() !== req.user.username;

  // Changing the handle you sign in with is a credential change: prove it is you.
  if (touchesIdentity) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(403).json({ error: 'Enter your current password to change your username' });
    }
    const row = queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
  }

  let nextUsername = req.user.username;
  if (touchesIdentity) {
    const clean = String(username).trim().toLowerCase();
    if (clean.length < 3 || clean.length > 30 || !/^[a-z0-9_-]+$/.test(clean)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric with - or _' });
    }
    const taken = queryOne<{ id: string }>('SELECT id FROM users WHERE username = ? AND id != ?', [
      clean,
      req.user.id,
    ]);
    if (taken) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    nextUsername = clean;
  }

  let nextDisplayName: string | undefined;
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty' });
    }
    if (displayName.trim().length > 60) {
      return res.status(400).json({ error: 'Display name must be 60 characters or fewer' });
    }
    nextDisplayName = displayName.trim();
  }

  let nextTheme: 'dark' | 'light' | undefined;
  if (themePreference !== undefined) {
    nextTheme = normaliseTheme(themePreference);
    if (!nextTheme) {
      return res.status(400).json({ error: 'Theme must be "dark" or "light"' });
    }
  }

  let nextAvatar: string | undefined;
  if (avatarColor !== undefined) {
    if (typeof avatarColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(avatarColor)) {
      return res.status(400).json({ error: 'Pick a valid avatar colour' });
    }
    nextAvatar = avatarColor.toLowerCase();
  }

  if (nextUsername !== req.user.username) {
    // The username is part of the password-strength check and the login rate-limit key
    run('UPDATE login_attempts SET username = ? WHERE username = ?', [nextUsername, req.user.username]);
    run('UPDATE users SET username = ? WHERE id = ?', [nextUsername, req.user.id]);
  }
  if (nextDisplayName !== undefined) {
    run('UPDATE users SET display_name = ? WHERE id = ?', [nextDisplayName, req.user.id]);
  }
  if (nextAvatar !== undefined) {
    run('UPDATE users SET avatar_color = ? WHERE id = ?', [nextAvatar, req.user.id]);
  }
  if (nextTheme !== undefined) {
    run('UPDATE users SET theme_preference = ? WHERE id = ?', [nextTheme, req.user.id]);
  }

  let removedKey: string | null = null;
  if (removeAvatar === true) {
    const row = queryOne<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
    removedKey = row?.avatar_url || null;
    run('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.id]);
    if (removedKey) {
      try {
        await getStorageAdapter().deleteObject(removedKey);
      } catch {}
    }
  }

  const fresh = queryOne<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    status: string;
    avatar_color: string;
    avatar_url: string | null;
    theme_preference: string | null;
    created_at: string;
  }>('SELECT * FROM users WHERE id = ?', [req.user.id]);

  if (!fresh) {
    return res.status(404).json({ error: 'Account not found' });
  }

  return res.json({
    success: true,
    message: nextUsername !== req.user.username ? 'Profile updated — sign in with your new username next time.' : 'Profile updated',
    user: {
      id: fresh.id,
      username: fresh.username,
      displayName: fresh.display_name,
      role: fresh.role,
      status: fresh.status,
      avatarColor: fresh.avatar_color,
      avatarUrl: avatarUrlFor(fresh.avatar_url),
      themePreference: normaliseTheme(fresh.theme_preference),
    },
  });
});

// Upload (or replace) the signed-in user's profile photo
authRouter.post('/avatar', handleAvatarUpload, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const file = (req as any).file as { filename: string; path: string; mimetype: string; originalname: string } | undefined;
  if (!file) {
    return res.status(400).json({ error: 'Pick a PNG, JPEG or WebP image under 2 MB' });
  }

  const storageKey = `avatars/${file.filename}`;
  let finalKey = storageKey;
  try {
    const storage = getStorageAdapter();
    if (storage.putObject) {
      const returned = await storage.putObject(storageKey, fs.readFileSync(file.path), file.mimetype, {
        filePath: file.path,
        fileName: file.originalname,
        fileSize: fs.statSync(file.path).size,
      });
      if (typeof returned === 'string' && returned.length > 0) finalKey = returned;
    }
    if (finalKey !== storageKey && (finalKey.startsWith('tg:') || finalKey.startsWith('tgmsg:'))) {
      fs.unlink(file.path, () => {});
    }
  } catch (err: any) {
    try {
      fs.unlink(file.path, () => {});
    } catch {}
    return res.status(500).json({ error: err?.message || 'Could not store that image' });
  }

  const previous = queryOne<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id = ?', [req.user.id]);
  run('UPDATE users SET avatar_url = ? WHERE id = ?', [finalKey, req.user.id]);
  if (previous?.avatar_url && previous.avatar_url !== finalKey) {
    try {
      await getStorageAdapter().deleteObject(previous.avatar_url);
    } catch {}
  }

  const fresh = queryOne<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    status: string;
    avatar_color: string;
    avatar_url: string | null;
    theme_preference: string | null;
  }>('SELECT * FROM users WHERE id = ?', [req.user.id]);

  const avatarUrl = avatarUrlFor(finalKey);
  return res.json({
    success: true,
    avatarUrl,
    user: fresh
      ? {
          id: fresh.id,
          username: fresh.username,
          displayName: fresh.display_name,
          role: fresh.role,
          status: fresh.status,
          avatarColor: fresh.avatar_color,
          avatarUrl: avatarUrlFor(fresh.avatar_url),
          themePreference: normaliseTheme(fresh.theme_preference),
        }
      : undefined,
  });
});

// Change own password (requires current password; signs out all other sessions)
authRouter.post('/change-password', sensitiveLimiter, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  const row = queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!row || !(await bcrypt.compare(currentPassword, row.password_hash))) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  const pwError = validatePassword(newPassword, req.user.username);
  if (pwError) {
    return res.status(400).json({ error: pwError });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), req.user.id]);
  // Keep the current session, drop every other one
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [req.user.id, hashToken(req.token || '')]);
  res.json({ success: true, message: 'Password changed. Other devices have been signed out.' });
});

// Delete own account
authRouter.delete('/account', sensitiveLimiter, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Re-authenticate: deleting an account is irreversible
  const confirmPassword = req.body?.password;
  const pwRow = queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (typeof confirmPassword !== 'string' || !pwRow || !(await bcrypt.compare(confirmPassword, pwRow.password_hash))) {
    return res.status(403).json({ error: 'Please enter your current password to delete your account.' });
  }

  const userId = req.user.id;
  // If user is admin, check if they are the only admin
  if (req.user.role === 'admin') {
    const adminCount = queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id != ? AND status = 'active'",
      [userId]
    );
    if (!adminCount || adminCount.count === 0) {
      return res.status(400).json({ error: 'Cannot delete the only administrator account.' });
    }
  }

  // Delete user media files and records
  const userPosts = queryAll<any>('SELECT id FROM posts WHERE owner_id = ?', [userId]);
  const storage = getStorageAdapter();
  for (const p of userPosts) {
    const files = queryAll<any>('SELECT storage_key, thumb_key FROM post_files WHERE post_id = ?', [p.id]);
    for (const f of files) {
      try {
        await storage.deleteObject(f.storage_key);
        if (f.thumb_key && f.thumb_key !== f.storage_key) {
          await storage.deleteObject(f.thumb_key);
        }
      } catch {}
    }
    run('DELETE FROM post_files WHERE post_id = ?', [p.id]);
    run("DELETE FROM item_groups WHERE item_type = 'post' AND item_id = ?", [p.id]);
    run('DELETE FROM album_items WHERE post_id = ?', [p.id]);
    run("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?", [p.id]);
    run("DELETE FROM reactions WHERE target_type = 'post' AND target_id = ?", [p.id]);
  }
  run('DELETE FROM posts WHERE owner_id = ?', [userId]);

  const userAlbums = queryAll<any>('SELECT id FROM albums WHERE creator_id = ?', [userId]);
  for (const a of userAlbums) {
    run('DELETE FROM album_items WHERE album_id = ?', [a.id]);
    run("DELETE FROM item_groups WHERE item_type = 'album' AND item_id = ?", [a.id]);
    run('DELETE FROM event_attendance WHERE event_id = ?', [a.id]);
    run('DELETE FROM event_notes WHERE event_id = ?', [a.id]);
    run("DELETE FROM comments WHERE target_type = 'album' AND target_id = ?", [a.id]);
  }
  run('DELETE FROM albums WHERE creator_id = ?', [userId]);

  const userGroups = queryAll<any>('SELECT id FROM groups WHERE creator_id = ? AND is_everyone = 0', [userId]);
  for (const g of userGroups) {
    run('DELETE FROM group_members WHERE group_id = ?', [g.id]);
    run('DELETE FROM item_groups WHERE group_id = ?', [g.id]);
    run('DELETE FROM comments WHERE group_id = ?', [g.id]);
    run('DELETE FROM reactions WHERE group_id = ?', [g.id]);
    run('DELETE FROM groups WHERE id = ?', [g.id]);
  }

  run('DELETE FROM group_members WHERE user_id = ?', [userId]);
  run('DELETE FROM event_attendance WHERE user_id = ?', [userId]);
  run('DELETE FROM event_notes WHERE author_id = ?', [userId]);
  run('DELETE FROM comments WHERE author_id = ?', [userId]);
  run('DELETE FROM reactions WHERE user_id = ?', [userId]);
  run('DELETE FROM notifications WHERE user_id = ?', [userId]);
  run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  run('DELETE FROM password_resets WHERE user_id = ?', [userId]);
  run('DELETE FROM login_attempts WHERE username = ?', [req.user.username]);
  run('DELETE FROM users WHERE id = ?', [userId]);

  clearSessionCookie(res);
  return res.json({ success: true, message: 'Your account has been deleted' });
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

function extractResetToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const input = raw.trim();
  if (!input) return '';
  const paramMatch = /(?:^|[#?&])token=([A-Za-z0-9_-]+)/i.exec(input);
  if (paramMatch) return paramMatch[1];
  return input;
}

// Redeem one-time password reset link
authRouter.post('/redeem-reset', redeemLimiter, async (req, res) => {
  const { token: rawToken, newPassword } = req.body || {};
  const token = extractResetToken(rawToken);

  if (!token || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Valid reset token and new password required' });
  }

  // Tokens are stored hashed. The raw value is also checked so links issued before hashing was introduced still work once.
  const resetRecord = queryOne<{
    token: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>('SELECT * FROM password_resets WHERE token IN (?, ?)', [hashToken(token), token]);

  if (!resetRecord) {
    return res.status(400).json({ error: 'Invalid or expired password reset link' });
  }

  if (resetRecord.used_at) {
    return res.status(400).json({ error: 'This reset link has already been used' });
  }

  if (new Date(resetRecord.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired' });
  }

  const target = queryOne<{ username: string }>('SELECT username FROM users WHERE id = ?', [resetRecord.user_id]);
  const pwError = validatePassword(newPassword, target?.username);
  if (pwError) {
    return res.status(400).json({ error: pwError });
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRecord.user_id]);
  run('UPDATE password_resets SET used_at = ? WHERE token = ?', [now, resetRecord.token]);
  // Invalidate any old sessions and failed-login lockouts for this user
  run('DELETE FROM sessions WHERE user_id = ?', [resetRecord.user_id]);
  if (target) run('DELETE FROM login_attempts WHERE username = ?', [target.username]);

  res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
});
