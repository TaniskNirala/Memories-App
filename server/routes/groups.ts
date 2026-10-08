import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';

export const groupsRouter = Router();

// All group endpoints require approved status
groupsRouter.use(requireApproved);

// List all groups current user belongs to (or all if admin)
groupsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  let sql = `
    SELECT g.*, 
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
      (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = ?) as is_member
    FROM groups g
  `;
  const params: any[] = [userId];

  if (!isAdmin) {
    sql += ` WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)`;
    params.push(userId);
  }

  sql += ` ORDER BY g.is_everyone DESC, g.created_at ASC`;

  const groups = queryAll(sql, params);

  // Attach members list for each group
  const result = groups.map((g) => {
    const members = queryAll<{
      id: string;
      username: string;
      display_name: string;
      avatar_color: string;
      role: string;
      joined_at: string;
    }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?
       ORDER BY u.display_name ASC`,
      [g.id]
    ).map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      display_name: m.display_name,
      avatarColor: m.avatar_color,
      avatar_color: m.avatar_color,
      role: m.role,
      joinedAt: m.joined_at,
    }));

    return {
      id: g.id,
      name: g.name,
      description: g.description,
      creatorId: g.creator_id,
      isEveryone: Boolean(g.is_everyone),
      createdAt: g.created_at,
      memberCount: g.member_count,
      isMember: Boolean(g.is_member),
      canManage: isAdmin || g.creator_id === userId,
      members,
    };
  });

  res.json({ groups: result });
});

// List all approved users (for adding to groups)
groupsRouter.get('/available-users', (req: AuthenticatedRequest, res) => {
  const users = queryAll<{
    id: string;
    username: string;
    display_name: string;
    avatar_color: string;
    role: string;
  }>(
    'SELECT id, username, display_name, avatar_color, role FROM users WHERE status = "active" AND role != "pending" ORDER BY display_name ASC'
  );
  res.json({ users });
});

// Create group
groupsRouter.post('/', (req: AuthenticatedRequest, res) => {
  const { name, description, memberIds } = req.body;
  const userId = req.user!.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const groupId = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    'INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    [groupId, name.trim(), description?.trim() || '', userId, now]
  );

  // Add creator as member
  run(
    'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
    [groupId, userId, now]
  );

  // Add specified approved members
  if (Array.isArray(memberIds)) {
    for (const mId of memberIds) {
      if (mId && mId !== userId) {
        // verify member is approved
        const target = queryOne<{ id: string }>(
          'SELECT id FROM users WHERE id = ? AND status = "active" AND role != "pending"',
          [mId]
        );
        if (target) {
          run(
            'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
            [groupId, mId, now]
          );
        }
      }
    }
  }

  res.status(201).json({ success: true, groupId });
});

// Get group detail
groupsRouter.get('/:id', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const group = queryOne<{
    id: string;
    name: string;
    description: string;
    creator_id: string;
    is_everyone: number;
    created_at: string;
  }>('SELECT * FROM groups WHERE id = ?', [groupId]);

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const isMember = queryOne<{ user_id: string }>(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );

  if (!isAdmin && !isMember) {
    return res.status(403).json({ error: 'You are not a member of this circle' });
  }

  const members = queryAll<{
    id: string;
    username: string;
    display_name: string;
    avatar_color: string;
    role: string;
    joined_at: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.role, gm.joined_at
     FROM group_members gm
     JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ?
     ORDER BY u.display_name ASC`,
    [groupId]
  );

  res.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      creatorId: group.creator_id,
      isEveryone: Boolean(group.is_everyone),
      createdAt: group.created_at,
      canManage: isAdmin || group.creator_id === userId,
      members,
    },
  });
});

// Rename / update group
groupsRouter.patch('/:id', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { name, description } = req.body;

  const group = queryOne<{ id: string; creator_id: string; is_everyone: number }>(
    'SELECT * FROM groups WHERE id = ?',
    [groupId]
  );

  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (group.is_everyone) return res.status(400).json({ error: 'The Everyone group cannot be modified' });
  if (!isAdmin && group.creator_id !== userId) {
    return res.status(403).json({ error: 'Only the circle creator or admin can update this group' });
  }

  if (name && name.trim()) {
    run('UPDATE groups SET name = ?, description = ? WHERE id = ?', [
      name.trim(),
      description !== undefined ? description.trim() : '',
      groupId,
    ]);
  }

  res.json({ success: true });
});

// Add member to group
groupsRouter.post('/:id/members', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { memberId } = req.body;

  const group = queryOne<{ id: string; creator_id: string; is_everyone: number }>(
    'SELECT * FROM groups WHERE id = ?',
    [groupId]
  );

  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (group.is_everyone) return res.status(400).json({ error: 'Members are added to Everyone automatically' });
  if (!isAdmin && group.creator_id !== userId) {
    return res.status(403).json({ error: 'Only the creator or admin can add members' });
  }

  const target = queryOne<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM users WHERE id = ? AND status = "active" AND role != "pending"',
    [memberId]
  );

  if (!target) {
    return res.status(400).json({ error: 'Selected user is not an approved member' });
  }

  run('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)', [
    groupId,
    memberId,
    new Date().toISOString(),
  ]);

  res.json({ success: true });
});

// Leave group or remove member
groupsRouter.delete('/:id/members/:targetUserId', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const targetUserId = req.params.targetUserId;
  const isAdmin = req.user!.role === 'admin';

  const group = queryOne<{ id: string; creator_id: string; is_everyone: number }>(
    'SELECT * FROM groups WHERE id = ?',
    [groupId]
  );

  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (group.is_everyone) return res.status(400).json({ error: 'Cannot leave the Everyone circle' });

  // Self leaving OR creator/admin removing member
  const isSelf = userId === targetUserId;
  const isCreatorOrAdmin = isAdmin || group.creator_id === userId;

  if (!isSelf && !isCreatorOrAdmin) {
    return res.status(403).json({ error: 'You do not have permission to remove this member' });
  }

  run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, targetUserId]);

  res.json({ success: true });
});

// Delete circle (creator or admin, cannot delete Everyone)
groupsRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const group = queryOne<{ id: string; creator_id: string; is_everyone: number; name: string }>(
    'SELECT * FROM groups WHERE id = ?',
    [groupId]
  );

  if (!group) return res.status(404).json({ error: 'Circle not found' });
  if (group.is_everyone) return res.status(400).json({ error: 'The Everyone circle cannot be deleted' });
  if (!isAdmin && group.creator_id !== userId) {
    return res.status(403).json({ error: 'Only the circle creator or an admin can delete this circle' });
  }

  // Remove placements for this circle (memories themselves remain safe with their owners)
  run('DELETE FROM item_groups WHERE group_id = ?', [groupId]);
  // Remove circle members
  run('DELETE FROM group_members WHERE group_id = ?', [groupId]);
  // Remove comments & reactions scoped to this circle
  run('DELETE FROM comments WHERE group_id = ?', [groupId]);
  run('DELETE FROM reactions WHERE group_id = ?', [groupId]);
  // Delete the group record
  run('DELETE FROM groups WHERE id = ?', [groupId]);

  return res.json({ success: true, message: `Circle "${group.name}" deleted successfully` });
});
