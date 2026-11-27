import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import { avatarUrlFor } from '../security/avatars.ts';
import { getStorageAdapter } from '../storage/index.ts';
import { MB } from '../limits.ts';
import { logger, errMessage } from '../logger.ts';

export const groupsRouter = Router();

// All group endpoints require approved status
groupsRouter.use(requireApproved);

/* ------------------------------------------------------- circle icon + banner
   Like profile photos, a circle's icon and banner are small JPEG/PNG/WebP files
   (already cropped / collaged in the browser) whose storage key lives on the
   group row. Only the circle creator or an admin may change them (the Everyone
   circle: admins only). */
type CircleImageKind = 'icon' | 'banner';

interface CircleImageRow {
  id: string;
  creator_id: string;
  is_everyone: number;
  icon_key: string | null;
  banner_key: string | null;
}

const circleImageDir = path.join(process.cwd(), 'uploads', 'circles');
if (!fs.existsSync(circleImageDir)) {
  fs.mkdirSync(circleImageDir, { recursive: true });
}

const circleImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, circleImageDir),
    filename: (_req, file, cb) => {
      const ext = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase())
        ? path.extname(file.originalname).toLowerCase()
        : '.jpg';
      cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * MB, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});

function canEditCircleImages(
  group: { creator_id: string; is_everyone: number },
  user: { id: string; role: string }
): boolean {
  if (user.role === 'admin') return true;
  return !group.is_everyone && group.creator_id === user.id;
}

function circleImageColumn(kind: CircleImageKind): 'icon_key' | 'banner_key' {
  return kind === 'icon' ? 'icon_key' : 'banner_key';
}

function isCircleImageKind(value: string): value is CircleImageKind {
  return value === 'icon' || value === 'banner';
}

/** Validates kind + circle + permission BEFORE any file is accepted. */
function loadEditableCircle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const kind = String(req.params.kind || '');
  if (!isCircleImageKind(kind)) {
    return res.status(400).json({ error: 'Image type must be "icon" or "banner"' });
  }
  const group = queryOne<CircleImageRow>('SELECT * FROM groups WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Circle not found' });
  if (!canEditCircleImages(group, req.user!)) {
    return res.status(403).json({ error: 'Only the circle creator or an admin can change circle images' });
  }
  res.locals.circle = group;
  res.locals.kind = kind;
  return next();
}

function handleCircleImageUpload(req: Request, res: Response, next: NextFunction) {
  circleImageUpload.single('image')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'That image is larger than 4 MB — try a smaller one.'
            : 'Could not upload that image.',
      });
    }
    return res.status(400).json({ error: 'Could not upload that image.' });
  });
}

async function removeStoredKey(key: string | null | undefined) {
  if (!key) return;
  try {
    await getStorageAdapter().deleteObject(key);
  } catch (err) {
    logger.warn('Could not delete a circle image (it may remain as an orphan):', err);
  }
}

function circleImageUrls(groupId: string) {
  const row = queryOne<{ icon_key: string | null; banner_key: string | null }>(
    'SELECT icon_key, banner_key FROM groups WHERE id = ?',
    [groupId]
  );
  return { iconUrl: avatarUrlFor(row?.icon_key), bannerUrl: avatarUrlFor(row?.banner_key) };
}

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
      avatar_url: string | null;
      role: string;
      joined_at: string;
    }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.role, gm.joined_at
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
      avatarUrl: avatarUrlFor(m.avatar_url),
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
      canEditImages: canEditCircleImages(
        { creator_id: String(g.creator_id), is_everyone: Number(g.is_everyone) },
        req.user!
      ),
      iconUrl: avatarUrlFor(g.icon_key as string | null),
      bannerUrl: avatarUrlFor(g.banner_key as string | null),
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
    avatar_url: string | null;
    role: string;
  }>(
    "SELECT id, username, display_name, avatar_color, avatar_url, role FROM users WHERE status = 'active' AND role != 'pending' ORDER BY display_name ASC"
  ).map((u) => ({
    ...u,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    avatarUrl: avatarUrlFor(u.avatar_url),
  }));
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
          "SELECT id FROM users WHERE id = ? AND status = 'active' AND role != 'pending'",
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
    icon_key: string | null;
    banner_key: string | null;
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
    avatar_url: string | null;
    role: string;
    joined_at: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.role, gm.joined_at
     FROM group_members gm
     JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ?
     ORDER BY u.display_name ASC`,
    [groupId]
  ).map((m) => ({
    ...m,
    displayName: m.display_name,
    avatarColor: m.avatar_color,
    avatarUrl: avatarUrlFor(m.avatar_url),
    joinedAt: m.joined_at,
  }));

  res.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      creatorId: group.creator_id,
      isEveryone: Boolean(group.is_everyone),
      createdAt: group.created_at,
      canManage: isAdmin || group.creator_id === userId,
      canEditImages: canEditCircleImages(group, req.user!),
      iconUrl: avatarUrlFor(group.icon_key),
      bannerUrl: avatarUrlFor(group.banner_key),
      members,
    },
  });
});

// Photos from this circle that can be used for its icon / banner (newest first)
groupsRouter.get('/:id/photos', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const group = queryOne<{ id: string }>('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) return res.status(404).json({ error: 'Circle not found' });

  const isMember = queryOne<{ user_id: string }>(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );
  if (!isAdmin && !isMember) {
    return res.status(403).json({ error: 'You are not a member of this circle' });
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 60, 1), 120);
  const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

  const rows = queryAll<{
    id: string;
    post_id: string;
    storage_key: string;
    thumb_key: string | null;
    width: number | null;
    height: number | null;
  }>(
    `SELECT pf.id, pf.post_id, pf.storage_key, pf.thumb_key, pf.width, pf.height
     FROM post_files pf
     JOIN posts p ON p.id = pf.post_id AND p.deleted_at IS NULL
     WHERE pf.file_type = 'photo' AND pf.tg_deleted_at IS NULL
       AND (
         p.id IN (
           SELECT item_id FROM item_groups
           WHERE item_type = 'post' AND group_id = ? AND (is_reference = 0 OR reference_status = 'approved')
         )
         OR p.id IN (
           SELECT ai.post_id FROM album_items ai
           JOIN item_groups ig ON ig.item_type = 'album' AND ig.item_id = ai.album_id
           WHERE ig.group_id = ?
         )
       )
     ORDER BY CASE WHEN p.date_basis = 'uploaded_at' THEN p.uploaded_at ELSE p.taken_at END DESC, pf.position ASC
     LIMIT ? OFFSET ?`,
    [groupId, groupId, limit + 1, offset]
  );

  const page = rows.slice(0, limit);
  res.json({
    photos: page.map((r) => ({
      id: r.id,
      postId: r.post_id,
      // Proxied through /api/storage/view so the browser can draw them to a canvas
      // (same origin) whatever the storage backend is.
      thumbUrl: avatarUrlFor(r.thumb_key || r.storage_key),
      fullUrl: avatarUrlFor(r.storage_key),
      width: r.width || undefined,
      height: r.height || undefined,
    })),
    hasMore: rows.length > limit,
  });
});

// Set (or replace) the circle icon or banner with an already-cropped image
groupsRouter.post('/:id/image/:kind', loadEditableCircle, handleCircleImageUpload, async (req: AuthenticatedRequest, res) => {
  const group = res.locals.circle as CircleImageRow;
  const kind = res.locals.kind as CircleImageKind;
  const column = circleImageColumn(kind);
  const file = (req as Request & { file?: { filename: string; path: string; mimetype: string; originalname: string } }).file;

  if (!file) {
    return res.status(400).json({ error: 'Pick a PNG, JPEG or WebP image under 4 MB' });
  }

  const storageKey = `circles/${file.filename}`;
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
  } catch (err) {
    fs.unlink(file.path, () => {});
    return res.status(500).json({ error: errMessage(err) || 'Could not store that image' });
  }

  const previous = group[column];
  run(`UPDATE groups SET ${column} = ? WHERE id = ?`, [finalKey, group.id]);
  if (previous && previous !== finalKey) await removeStoredKey(previous);

  return res.json({ success: true, ...circleImageUrls(group.id) });
});

// Remove the circle icon or banner (back to the coloured initials / plain card)
groupsRouter.delete('/:id/image/:kind', loadEditableCircle, async (_req: AuthenticatedRequest, res) => {
  const group = res.locals.circle as CircleImageRow;
  const kind = res.locals.kind as CircleImageKind;
  const column = circleImageColumn(kind);

  const previous = group[column];
  run(`UPDATE groups SET ${column} = NULL WHERE id = ?`, [group.id]);
  await removeStoredKey(previous);

  return res.json({ success: true, ...circleImageUrls(group.id) });
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
    "SELECT id, display_name FROM users WHERE id = ? AND status = 'active' AND role != 'pending'",
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

  const group = queryOne<{
    id: string;
    creator_id: string;
    is_everyone: number;
    name: string;
    icon_key: string | null;
    banner_key: string | null;
  }>('SELECT * FROM groups WHERE id = ?', [groupId]);

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
  // Best-effort cleanup of the circle's icon / banner files
  void removeStoredKey(group.icon_key);
  void removeStoredKey(group.banner_key);

  return res.json({ success: true, message: `Circle "${group.name}" deleted successfully` });
});