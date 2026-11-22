import { hashToken } from '../security/tokens.ts';
import { getAppBaseUrl } from '../security/http.ts';
import { Router } from 'express';
import crypto from 'crypto';
import { avatarUrlFor } from '../security/avatars.ts';
import { queryOne, queryAll, run, getDatabaseStatus, triggerDatabaseSync, restoreDatabaseFromCloud, flushNeonWrites } from '../db.ts';
import { AuthenticatedRequest, requireAdmin, requireApproved } from '../middleware/auth.ts';
import { getStorageAdapter, getStorageCapabilities } from '../storage/index.ts';
import { syncStorageToDatabase, repairPostFileKeys } from '../storage/sync.ts';
import { scanTelegramDeletions } from '../storage/tg-deletion-sync.ts';
import { logger, errMessage } from '../logger.ts';
import type { Row } from '../rows.ts';

export const adminRouter = Router();

// Member report endpoint (accessible by approved members)
export const reportsRouter = Router();
reportsRouter.use(requireApproved);

reportsRouter.post('/', (req: AuthenticatedRequest, res) => {
  const { targetType, targetId, reason } = req.body;
  const userId = req.user!.id;

  if (!targetId || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Target and reason required' });
  }

  const reportId = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    'INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [reportId, userId, targetType || 'post', targetId, reason.trim(), 'pending', now]
  );

  // Notify admins
  const admins = queryAll<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
  for (const adm of admins) {
    run(
      'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [
        crypto.randomUUID(),
        adm.id,
        'new_signup',
        'New Content Report',
        `A member reported a ${targetType || 'post'}: "${reason.trim().slice(0, 50)}"`,
        '/admin',
        now,
      ]
    );
  }

  res.status(201).json({ success: true, message: 'Report submitted for admin review' });
});

// All following endpoints require Admin role
adminRouter.use(requireAdmin);

// Database persistence & Turso synchronization status
adminRouter.get('/db-status', (_req: AuthenticatedRequest, res) => {
  const status = getDatabaseStatus();
  const users = queryOne<{ count: number }>('SELECT count(*) as count FROM users');
  const posts = queryOne<{ count: number }>('SELECT count(*) as count FROM posts');
  res.json({
    ...status,
    userCount: users?.count || 0,
    postCount: posts?.count || 0,
  });
});

// Trigger manual cloud database sync
adminRouter.post('/db-sync', async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await triggerDatabaseSync();
    await repairPostFileKeys().catch(() => {});
    res.json(result);
  } catch (err) {
    logger.error('admin.ts error:', err);
    res.status(500).json({ error: 'Failed to sync database' });
  }
});

// Rebuild the local cache entirely from Neon
adminRouter.post('/restore-turso', async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await restoreDatabaseFromCloud();
    await repairPostFileKeys().catch(() => {});
    res.json(result);
  } catch (err) {
    logger.error('admin.ts error:', err);
    res.status(500).json({ error: 'Failed to restore database from Neon' });
  }
});

// Database credentials are configured via the DATABASE_URL environment variable (Neon)
adminRouter.post('/db-config', async (_req: AuthenticatedRequest, res) => {
  res.status(400).json({
    error: 'The database is configured with the DATABASE_URL environment variable (Neon). Set it in the Render dashboard and redeploy.',
  });
});

// Read-only storage backend diagnostics (never exposes secrets or tokens)
adminRouter.get('/storage-status', (_req: AuthenticatedRequest, res) => {
  const capabilities = getStorageCapabilities();
  const tgCountRow = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM post_files WHERE storage_key LIKE 'tg:%' OR storage_key LIKE 'tgmsg:%'"
  );
  const legacyCountRow = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM post_files WHERE storage_key NOT LIKE 'tg:%' AND storage_key NOT LIKE 'tgmsg:%'"
  );
  res.json({
    ...capabilities,
    telegramFileCount: tgCountRow?.count || 0,
    legacyFileCount: legacyCountRow?.count || 0,
  });
});

// Manually re-scan Telegram for media that was deleted from the channel
adminRouter.post('/telegram/check-deleted', async (_req: AuthenticatedRequest, res) => {
  const result = await scanTelegramDeletions();
  const flagged = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM post_files WHERE tg_deleted_at IS NOT NULL'
  );
  res.json({ ...result, totalFlaggedDeleted: flagged?.count || 0 });
});

// Live storage connectivity test (verifies Telegram Bot API, MTProto channel, and B2 fallback)
adminRouter.post('/storage-test', async (_req: AuthenticatedRequest, res) => {
  try {
    const storage = getStorageAdapter();
    if (storage.testConnection) {
      const result = await storage.testConnection();
      return res.json({
        ...result,
        capabilities: getStorageCapabilities(),
      });
    }

    const caps = getStorageCapabilities();
    if (caps.backend === 's3' && storage.listObjects) {
      const keys = await storage.listObjects('');
      return res.json({
        ok: true,
        summary: `Connected to ${caps.mode} (${keys.length} object(s) found).`,
        lanes: { b2Fallback: { enabled: true, ok: true, objectCount: keys.length } },
        capabilities: caps,
      });
    }

    return res.json({
      ok: true,
      summary: `Using ${caps.mode}.`,
      lanes: {},
      capabilities: caps,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      summary: errMessage(err) || 'Storage connection test failed',
      lanes: {},
      capabilities: getStorageCapabilities(),
    });
  }
});

// Sync past uploads from cloud storage into database
adminRouter.post('/sync-storage', async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await syncStorageToDatabase();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('admin.ts error:', err);
    res.status(500).json({ error: 'Failed to sync storage' });
  }
});

// Clear all feed posts, memories, and collections from database and cloud (keeps users & circles intact)
adminRouter.post('/clear-feed', async (_req: AuthenticatedRequest, res) => {
  try {
    run('PRAGMA foreign_keys = OFF');
    run('DELETE FROM comments');
    run('DELETE FROM reactions');
    run('DELETE FROM post_files');
    run('DELETE FROM album_items');
    run('DELETE FROM event_attendance');
    run('DELETE FROM event_notes');
    run("DELETE FROM item_groups WHERE item_type IN ('post', 'album')");
    run('DELETE FROM posts');
    run('DELETE FROM albums');
    run('PRAGMA foreign_keys = ON');

    await flushNeonWrites().catch(() => {});

    res.json({
      success: true,
      message: 'All feed posts, memories, and collections cleared. Users and circles preserved.',
    });
  } catch (err) {
    logger.error('Error during clear-feed:', err);
    res.status(500).json({ error: 'Failed to clear feed' });
  }
});

// Purge all past uploaded files from cloud/local storage and wipe all posts/albums/comments from database
adminRouter.post('/purge-all-data', async (_req: AuthenticatedRequest, res) => {
  try {
    const storage = getStorageAdapter();
    let deletedFiles = 0;
    let purgeNote: string | undefined;
    if (storage.purgeAllObjects) {
      const result = await storage.purgeAllObjects();
      deletedFiles = result.deleted;
      purgeNote = result.note;
    }

    // Wipe all media posts, files, albums, comments, reactions from database
    run('PRAGMA foreign_keys = OFF');
    run('DELETE FROM comments');
    run('DELETE FROM reactions');
    run('DELETE FROM post_files');
    run('DELETE FROM album_items');
    run('DELETE FROM event_attendance');
    run('DELETE FROM event_notes');
    run("DELETE FROM item_groups WHERE item_type IN ('post', 'album')");
    run('DELETE FROM posts');
    run('DELETE FROM albums');
    run('PRAGMA foreign_keys = ON');

    await flushNeonWrites().catch(() => {});

    res.json({
      success: true,
      message: purgeNote
        ? `Cleared all feed posts and collections (${deletedFiles} local cache file(s) removed). ${purgeNote}`
        : `Permanently deleted ${deletedFiles} file(s) from storage bucket and cleared all posts and collections from the database.`,
      deletedFiles,
    });
  } catch (err) {
    logger.error('Error during purge-all-data:', err);
    res.status(500).json({ error: 'Failed to purge data from storage' });
  }
});

// 1. Pending signups
adminRouter.get('/pending-signups', (req: AuthenticatedRequest, res) => {
  const pending = queryAll<Row>(
    "SELECT id, username, display_name, avatar_color, avatar_url, created_at FROM users WHERE role = 'pending' ORDER BY created_at ASC"
  ).map((u) => ({ ...u, avatarUrl: avatarUrlFor(u.avatar_url) }));
  res.json({ pending });
});

// Approve user
// "An automatic 'Everyone' group contains every approved member."
adminRouter.post('/approve-user/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  const target = queryOne<Row>('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const now = new Date().toISOString();
  run("UPDATE users SET role = 'member', status = 'active' WHERE id = ?", [targetId]);

  // Ensure "Everyone" group exists and add user
  let everyoneGroupId = queryOne<Row>('SELECT id FROM groups WHERE is_everyone = 1')?.id;
  if (!everyoneGroupId) {
    everyoneGroupId = crypto.randomUUID();
    run(
      'INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [everyoneGroupId, 'Everyone', 'Automatic circle containing all approved friends', adminId, now]
    );
  }

  run(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
    [everyoneGroupId, targetId, now]
  );

  // Audit log
  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), adminId, 'user_approved', 'user', targetId, `Approved user @${target.username}`, now]
  );

  // Send notification to user
  run(
    'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    [
      crypto.randomUUID(),
      targetId,
      'proposal_approved',
      'Account Approved!',
      'Welcome to Nest! Your account has been approved. You are now part of the Everyone circle.',
      '/',
      now,
    ]
  );

  res.json({ success: true, message: `Approved @${target.username}` });
});

// Reject user signup
adminRouter.post('/reject-user/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  const target = queryOne<Row>('SELECT username FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  run('DELETE FROM users WHERE id = ?', [targetId]);

  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), adminId, 'user_suspended', 'user', targetId, `Rejected signup @${target.username}`, new Date().toISOString()]
  );

  res.json({ success: true, message: `Rejected @${target.username}` });
});

// 2. All users list & status management
adminRouter.get('/users', (req: AuthenticatedRequest, res) => {
  const users = queryAll<Row>(
    `SELECT id, username, display_name, role, status, avatar_color, avatar_url, created_at,
            (SELECT COUNT(*) FROM posts WHERE owner_id = users.id AND deleted_at IS NULL) as post_count
     FROM users
     ORDER BY role ASC, created_at DESC`
  ).map((u) => ({ ...u, avatarUrl: avatarUrlFor(u.avatar_url) }));
  res.json({ users });
});

// Suspend or unsuspend user
adminRouter.post('/toggle-suspend/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  if (targetId === adminId) {
    return res.status(400).json({ error: 'Cannot suspend your own admin account' });
  }

  const target = queryOne<Row>('SELECT username, status FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const newStatus = target.status === 'active' ? 'suspended' : 'active';
  run('UPDATE users SET status = ? WHERE id = ?', [newStatus, targetId]);

  if (newStatus === 'suspended') {
    // Invalidate active sessions
    run('DELETE FROM sessions WHERE user_id = ?', [targetId]);
  }

  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      crypto.randomUUID(),
      adminId,
      'user_suspended',
      'user',
      targetId,
      `Changed status of @${target.username} to ${newStatus}`,
      new Date().toISOString(),
    ]
  );

  res.json({ success: true, status: newStatus });
});

// Permanently delete user account and associated data
adminRouter.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  if (targetId === adminId) {
    return res.status(400).json({ error: 'Cannot delete your own admin account' });
  }

  const target = queryOne<Row>('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // 1. Delete user's media files from disk/storage
  const userPosts = queryAll<Row>('SELECT id FROM posts WHERE owner_id = ?', [targetId]);
  const storage = getStorageAdapter();
  for (const p of userPosts) {
    const files = queryAll<Row>('SELECT storage_key, thumb_key FROM post_files WHERE post_id = ?', [p.id]);
    for (const f of files) {
      try {
        await storage.deleteObject(f.storage_key);
        if (f.thumb_key && f.thumb_key !== f.storage_key) {
          await storage.deleteObject(f.thumb_key);
        }
      } catch (err) {
        logger.warn('Could not delete a storage object (it may remain as an orphan):', err);
      }
    }
    run('DELETE FROM post_files WHERE post_id = ?', [p.id]);
    run("DELETE FROM item_groups WHERE item_type = 'post' AND item_id = ?", [p.id]);
    run('DELETE FROM album_items WHERE post_id = ?', [p.id]);
    run("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?", [p.id]);
    run("DELETE FROM reactions WHERE target_type = 'post' AND target_id = ?", [p.id]);
  }
  run('DELETE FROM posts WHERE owner_id = ?', [targetId]);

  // 2. Delete albums/events created by this user
  const userAlbums = queryAll<Row>('SELECT id FROM albums WHERE creator_id = ?', [targetId]);
  for (const a of userAlbums) {
    run('DELETE FROM album_items WHERE album_id = ?', [a.id]);
    run("DELETE FROM item_groups WHERE item_type = 'album' AND item_id = ?", [a.id]);
    run('DELETE FROM event_attendance WHERE event_id = ?', [a.id]);
    run('DELETE FROM event_notes WHERE event_id = ?', [a.id]);
    run("DELETE FROM comments WHERE target_type = 'album' AND target_id = ?", [a.id]);
  }
  run('DELETE FROM albums WHERE creator_id = ?', [targetId]);

  // 3. Delete custom circles created by this user
  const userGroups = queryAll<Row>('SELECT id FROM groups WHERE creator_id = ? AND is_everyone = 0', [targetId]);
  for (const g of userGroups) {
    run('DELETE FROM group_members WHERE group_id = ?', [g.id]);
    run('DELETE FROM item_groups WHERE group_id = ?', [g.id]);
    run('DELETE FROM comments WHERE group_id = ?', [g.id]);
    run('DELETE FROM reactions WHERE group_id = ?', [g.id]);
    run('DELETE FROM groups WHERE id = ?', [g.id]);
  }

  // 4. Remove user from memberships, event attendance, notes, comments, sessions
  run('DELETE FROM group_members WHERE user_id = ?', [targetId]);
  run('DELETE FROM event_attendance WHERE user_id = ?', [targetId]);
  run('DELETE FROM event_notes WHERE author_id = ?', [targetId]);
  run('DELETE FROM comments WHERE author_id = ?', [targetId]);
  run('DELETE FROM reactions WHERE user_id = ?', [targetId]);
  run('DELETE FROM notifications WHERE user_id = ?', [targetId]);
  run('DELETE FROM sessions WHERE user_id = ?', [targetId]);
  run('DELETE FROM password_resets WHERE user_id = ?', [targetId]);
  run('DELETE FROM login_attempts WHERE username = ?', [target.username]);

  // 5. Delete user record
  run('DELETE FROM users WHERE id = ?', [targetId]);

  // 6. Audit log
  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      crypto.randomUUID(),
      adminId,
      'user_deleted',
      'user',
      targetId,
      `Permanently deleted user @${target.username} (${target.display_name})`,
      new Date().toISOString(),
    ]
  );

  res.json({ success: true, message: `User @${target.username} deleted permanently` });
});

// 3. Generate one-time password reset link
// "Admins generate one-time password reset links."
adminRouter.post('/generate-reset-link/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  const target = queryOne<Row>('SELECT username FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const token = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h validity

  run(
    'INSERT INTO password_resets (token, user_id, expires_at, used_at, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    [hashToken(token), targetId, expiresAt, adminId, now]
  );

  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), adminId, 'password_reset_created', 'user', targetId, `Generated one-time reset link for @${target.username}`, now]
  );

  // Token goes in the URL fragment so it is never sent to servers, proxies or Referer headers
  const resetUrl = `${getAppBaseUrl(req)}/#token=${token}`;

  res.json({
    success: true,
    token,
    resetUrl,
    expiresAt,
    username: target.username,
  });
});

// 4. Pending album / event proposals
adminRouter.get('/pending-proposals', (req: AuthenticatedRequest, res) => {
  const proposals = queryAll<Row>(
    `SELECT a.*, u.username as creator_username, u.display_name as creator_display_name
     FROM albums a
     JOIN users u ON a.creator_id = u.id
     WHERE a.status = 'pending_approval'
     ORDER BY a.created_at ASC`
  );
  res.json({ proposals });
});

// Approve or reject proposal
adminRouter.post('/proposals/:id/decide', (req: AuthenticatedRequest, res) => {
  const proposalId = req.params.id;
  const adminId = req.user!.id;
  const { decision } = req.body; // 'approved' or 'rejected'

  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }

  const album = queryOne<Row>('SELECT * FROM albums WHERE id = ?', [proposalId]);
  if (!album) return res.status(404).json({ error: 'Proposal not found' });

  const now = new Date().toISOString();
  run('UPDATE albums SET status = ? WHERE id = ?', [decision, proposalId]);

  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      crypto.randomUUID(),
      adminId,
      decision === 'approved' ? 'proposal_approved' : 'proposal_rejected',
      'album',
      proposalId,
      `${decision === 'approved' ? 'Approved' : 'Rejected'} proposal "${album.title}"`,
      now,
    ]
  );

  // Notify creator
  run(
    'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    [
      crypto.randomUUID(),
      album.creator_id,
      'proposal_approved',
      `Proposal ${decision === 'approved' ? 'Approved' : 'Declined'}`,
      `Your proposed collection "${album.title}" has been ${decision}.`,
      `/album/${proposalId}`,
      now,
    ]
  );

  res.json({ success: true, decision });
});

// 5. Reports review
adminRouter.get('/reports', (req: AuthenticatedRequest, res) => {
  const reports = queryAll<Row>(
    `SELECT r.*, u.username as reporter_username, u.display_name as reporter_display_name
     FROM reports r
     JOIN users u ON r.reporter_id = u.id
     ORDER BY r.created_at DESC`
  );
  res.json({ reports });
});

adminRouter.post('/reports/:id/decide', (req: AuthenticatedRequest, res) => {
  const reportId = req.params.id;
  const { status } = req.body; // 'resolved' or 'dismissed'

  run('UPDATE reports SET status = ? WHERE id = ?', [status || 'resolved', reportId]);
  res.json({ success: true });
});

// 6. Audit log
adminRouter.get('/audit-log', (req: AuthenticatedRequest, res) => {
  const logs = queryAll<Row>(
    `SELECT al.*, u.username as actor_username, u.display_name as actor_display_name
     FROM audit_log al
     JOIN users u ON al.actor_id = u.id
     ORDER BY al.created_at DESC LIMIT 100`
  );
  res.json({ logs });
});
