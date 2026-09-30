import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireAdmin, requireApproved } from '../middleware/auth.ts';

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
  const admins = queryAll<{ id: string }>('SELECT id FROM users WHERE role = "admin"');
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

// 1. Pending signups
adminRouter.get('/pending-signups', (req: AuthenticatedRequest, res) => {
  const pending = queryAll<any>(
    'SELECT id, username, display_name, avatar_color, created_at FROM users WHERE role = "pending" ORDER BY created_at ASC'
  );
  res.json({ pending });
});

// Approve user
// "An automatic 'Everyone' group contains every approved member."
adminRouter.post('/approve-user/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  const target = queryOne<any>('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const now = new Date().toISOString();
  run('UPDATE users SET role = "member" WHERE id = ?', [targetId]);

  // Ensure "Everyone" group exists and add user
  let everyone = queryOne<any>('SELECT id FROM groups WHERE is_everyone = 1');
  if (!everyone) {
    const everyoneId = crypto.randomUUID();
    run(
      'INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [everyoneId, 'Everyone', 'Automatic circle containing all approved friends', adminId, now]
    );
    everyone = { id: everyoneId };
  }

  run(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
    [everyone.id, targetId, now]
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
      'Welcome to Kinfolk! Your account has been approved. You are now part of the Everyone circle.',
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

  const target = queryOne<any>('SELECT username FROM users WHERE id = ?', [targetId]);
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
  const users = queryAll<any>(
    `SELECT id, username, display_name, role, status, avatar_color, created_at,
            (SELECT COUNT(*) FROM posts WHERE owner_id = users.id AND deleted_at IS NULL) as post_count
     FROM users
     ORDER BY role ASC, created_at DESC`
  );
  res.json({ users });
});

// Suspend or unsuspend user
adminRouter.post('/toggle-suspend/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  if (targetId === adminId) {
    return res.status(400).json({ error: 'Cannot suspend your own admin account' });
  }

  const target = queryOne<any>('SELECT username, status FROM users WHERE id = ?', [targetId]);
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

// 3. Generate one-time password reset link
// "Admins generate one-time password reset links."
adminRouter.post('/generate-reset-link/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const adminId = req.user!.id;

  const target = queryOne<any>('SELECT username FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const token = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h validity

  run(
    'INSERT INTO password_resets (token, user_id, expires_at, used_at, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    [token, targetId, expiresAt, adminId, now]
  );

  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), adminId, 'password_reset_created', 'user', targetId, `Generated one-time reset link for @${target.username}`, now]
  );

  const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

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
  const proposals = queryAll<any>(
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

  const album = queryOne<any>('SELECT * FROM albums WHERE id = ?', [proposalId]);
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
  const reports = queryAll<any>(
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
  const logs = queryAll<any>(
    `SELECT al.*, u.username as actor_username, u.display_name as actor_display_name
     FROM audit_log al
     JOIN users u ON al.actor_id = u.id
     ORDER BY al.created_at DESC LIMIT 100`
  );
  res.json({ logs });
});
