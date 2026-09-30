import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';

export const reactionsRouter = Router();
reactionsRouter.use(requireApproved);

// Toggle emoji reaction
reactionsRouter.post('/toggle', (req: AuthenticatedRequest, res) => {
  const { targetType = 'post', targetId, groupId, emoji } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!targetId || !groupId || !emoji) {
    return res.status(400).json({ error: 'targetId, groupId and emoji are required' });
  }

  // Check group membership
  if (userRole !== 'admin') {
    const isMember = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this circle' });
  }

  const existing = queryOne<any>(
    'SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND group_id = ? AND user_id = ? AND emoji = ?',
    [targetType, targetId, groupId, userId, emoji]
  );

  if (existing) {
    run('DELETE FROM reactions WHERE id = ?', [existing.id]);
    return res.json({ success: true, action: 'removed', emoji });
  } else {
    const reactionId = crypto.randomUUID();
    run(
      'INSERT INTO reactions (id, target_type, target_id, group_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [reactionId, targetType, targetId, groupId, userId, emoji, new Date().toISOString()]
    );
    return res.json({ success: true, action: 'added', emoji });
  }
});

// Get reactions summary for item in a group
reactionsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const { targetType = 'post', targetId, groupId } = req.query as { targetType?: string; targetId?: string; groupId?: string };
  const userId = req.user!.id;

  if (!targetId || !groupId) {
    return res.status(400).json({ error: 'targetId and groupId required' });
  }

  const reactions = queryAll<any>(
    `SELECT r.emoji, r.user_id, u.username, u.display_name
     FROM reactions r
     JOIN users u ON r.user_id = u.id
     WHERE r.target_type = ? AND r.target_id = ? AND r.group_id = ?`,
    [targetType, targetId, groupId]
  );

  // Group by emoji
  const grouped: Record<string, { emoji: string; count: number; userReacted: boolean; users: string[] }> = {};

  for (const r of reactions) {
    if (!grouped[r.emoji]) {
      grouped[r.emoji] = {
        emoji: r.emoji,
        count: 0,
        userReacted: false,
        users: [],
      };
    }
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.display_name || r.username);
    if (r.user_id === userId) {
      grouped[r.emoji].userReacted = true;
    }
  }

  res.json({ reactions: Object.values(grouped) });
});
