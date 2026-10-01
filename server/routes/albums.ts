import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import { getStorageAdapter } from '../storage/index.ts';

export const albumsRouter = Router();
albumsRouter.use(requireApproved);

// Helper to check if user can view an album
export function canUserViewAlbum(userId: string, userRole: string, albumId: string): boolean {
  if (userRole === 'admin') return true;

  const album = queryOne<any>('SELECT * FROM albums WHERE id = ?', [albumId]);
  if (!album) return false;
  if (album.creator_id === userId) return true;
  if (album.status !== 'approved') return false;

  const placements = queryAll<any>(
    `SELECT ig.*
     FROM item_groups ig
     JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
     WHERE ig.item_type = 'album' AND ig.item_id = ?`,
    [userId, albumId]
  );

  return placements.length > 0;
}

// Propose / create album or event
// "Proposals: members propose new albums and events; admins approve or reject. Single posts and groups need no approval."
albumsRouter.post('/', (req: AuthenticatedRequest, res) => {
  const { title, description, isEvent, eventDate, eventPlace, groupIds } = req.body;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Album/Event title is required' });
  }

  const albumId = crypto.randomUUID();
  const status = isAdmin ? 'approved' : 'pending_approval';
  const now = new Date().toISOString();

  run(
    `INSERT INTO albums (id, title, description, creator_id, is_event, event_date, event_place, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      albumId,
      title.trim(),
      description?.trim() || '',
      userId,
      isEvent ? 1 : 0,
      eventDate || null,
      eventPlace?.trim() || null,
      status,
      now,
    ]
  );

  // Link to target groups
  const targetGroups = Array.isArray(groupIds) ? groupIds : [];
  for (const gId of targetGroups) {
    const member = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [gId, userId]);
    if (member || isAdmin) {
      run(
        `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
         VALUES (?, 'album', ?, ?, ?, 0, 'approved', ?)`,
        [crypto.randomUUID(), albumId, gId, userId, now]
      );
    }
  }

  // If member proposed, notify admins
  if (!isAdmin) {
    const admins = queryAll<{ id: string }>('SELECT id FROM users WHERE role = "admin"');
    for (const adm of admins) {
      run(
        'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [
          crypto.randomUUID(),
          adm.id,
          'proposal_approved', // proposal category
          'New Collection Proposal',
          `@${req.user!.username} proposed a new ${isEvent ? 'event' : 'album'}: "${title.trim()}".`,
          '/admin',
          now,
        ]
      );
    }
  }

  res.status(201).json({
    success: true,
    albumId,
    status,
    message: isAdmin ? 'Album created' : 'Album proposal submitted for admin approval',
  });
});

// List albums
albumsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  let sql = `
    SELECT DISTINCT a.*, u.username as creator_username, u.display_name as creator_display_name,
      (SELECT COUNT(*) FROM album_items ai WHERE ai.album_id = a.id) as item_count
    FROM albums a
    JOIN users u ON a.creator_id = u.id
  `;
  const params: any[] = [];

  if (!isAdmin) {
    sql += `
      LEFT JOIN item_groups ig ON ig.item_type = 'album' AND ig.item_id = a.id
      LEFT JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
      WHERE (a.creator_id = ? OR (a.status = 'approved' AND gm.user_id = ?))
    `;
    params.push(userId, userId, userId);
  }

  sql += ` ORDER BY a.created_at DESC`;

  const albums = queryAll<any>(sql, params);
  const storage = getStorageAdapter();

  // Attach cover mosaic thumbnails (up to 4)
  const results = await Promise.all(
    albums.map(async (alb) => {
      const topItems = queryAll<any>(
        `SELECT pf.thumb_key, pf.storage_key
         FROM album_items ai
         JOIN posts p ON ai.post_id = p.id AND p.deleted_at IS NULL
         JOIN post_files pf ON pf.post_id = p.id AND pf.position = 0
         WHERE ai.album_id = ?
         ORDER BY ai.position ASC LIMIT 4`,
        [alb.id]
      );

      const mosaicUrls = await Promise.all(
        topItems.map((item) => storage.getSignedViewUrl(item.thumb_key || item.storage_key))
      );

      return {
        id: alb.id,
        title: alb.title,
        description: alb.description,
        isEvent: Boolean(alb.is_event),
        eventDate: alb.event_date,
        eventPlace: alb.event_place,
        status: alb.status,
        itemCount: alb.item_count,
        creator: {
          id: alb.creator_id,
          username: alb.creator_username,
          displayName: alb.creator_display_name,
        },
        mosaicUrls,
        createdAt: alb.created_at,
      };
    })
  );

  res.json({ albums: results });
});

// Get album details
albumsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!canUserViewAlbum(userId, userRole, albumId)) {
    return res.status(403).json({ error: 'Access denied or album not found' });
  }

  const album = queryOne<any>(
    `SELECT a.*, u.username as creator_username, u.display_name as creator_display_name
     FROM albums a
     JOIN users u ON a.creator_id = u.id
     WHERE a.id = ?`,
    [albumId]
  );

  if (!album) return res.status(404).json({ error: 'Album not found' });

  const itemCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM album_items WHERE album_id = ?', [albumId]);

  res.json({
    album: {
      id: album.id,
      title: album.title,
      description: album.description,
      isEvent: Boolean(album.is_event),
      eventDate: album.event_date,
      eventPlace: album.event_place,
      status: album.status,
      itemCount: itemCount?.count || 0,
      creator: {
        id: album.creator_id,
        username: album.creator_username,
        displayName: album.creator_display_name,
      },
      createdAt: album.created_at,
    },
  });
});

// Lazy-loaded album posts grid: "opens into a lazily loaded thumbnail grid (60 at a time)"
albumsRouter.get('/:id/items', async (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const limit = Math.min(parseInt(req.query.limit as string) || 60, 60);
  const offset = parseInt(req.query.offset as string) || 0;

  if (!canUserViewAlbum(userId, userRole, albumId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const items = queryAll<any>(
    `SELECT ai.position, p.id as post_id, p.caption, p.taken_at, p.uploaded_at, pf.storage_key, pf.thumb_key, pf.file_type, pf.width, pf.height
     FROM album_items ai
     JOIN posts p ON ai.post_id = p.id AND p.deleted_at IS NULL
     JOIN post_files pf ON pf.post_id = p.id AND pf.position = 0
     WHERE ai.album_id = ?
     ORDER BY ai.position ASC, p.taken_at ASC
     LIMIT ? OFFSET ?`,
    [albumId, limit, offset]
  );

  const storage = getStorageAdapter();
  const loadedItems = await Promise.all(
    items.map(async (item) => ({
      postId: item.post_id,
      caption: item.caption,
      takenAt: item.taken_at,
      fileType: item.file_type,
      width: item.width,
      height: item.height,
      thumbUrl: await storage.getSignedViewUrl(item.thumb_key || item.storage_key),
      viewUrl: await storage.getSignedViewUrl(item.storage_key),
    }))
  );

  const totalCount = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM album_items ai JOIN posts p ON ai.post_id = p.id AND p.deleted_at IS NULL WHERE ai.album_id = ?`,
    [albumId]
  );

  res.json({
    items: loadedItems,
    offset,
    limit,
    total: totalCount?.count || 0,
    hasMore: offset + loadedItems.length < (totalCount?.count || 0),
  });
});

// Event attendance: "anyone can mark 'I was there', and the owner can tag friends as present, who can remove the tag"
albumsRouter.get('/:id/attendance', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const attendees = queryAll<any>(
    `SELECT ea.user_id, ea.tagged_by, ea.created_at,
            u.username, u.display_name, u.avatar_color,
            tu.username as tagger_username
     FROM event_attendance ea
     JOIN users u ON ea.user_id = u.id
     LEFT JOIN users tu ON ea.tagged_by = tu.id
     WHERE ea.event_id = ?
     ORDER BY ea.created_at ASC`,
    [albumId]
  );

  res.json({
    attendees: attendees.map((a) => ({
      userId: a.user_id,
      username: a.username,
      displayName: a.display_name,
      avatarColor: a.avatar_color,
      taggedBy: a.tagged_by ? { id: a.tagged_by, username: a.tagger_username } : null,
      isSelf: a.user_id === req.user!.id,
    })),
  });
});

albumsRouter.post('/:id/attendance', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const { targetUserId } = req.body; // If tagging someone else

  const album = queryOne<any>('SELECT creator_id, is_event, title FROM albums WHERE id = ?', [albumId]);
  if (!album || !album.is_event) {
    return res.status(400).json({ error: 'Valid event required' });
  }

  const now = new Date().toISOString();

  if (targetUserId && targetUserId !== userId) {
    // Owner or admin tagging someone else
    if (album.creator_id !== userId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only the event host or admin can tag friends' });
    }

    run(
      'INSERT OR IGNORE INTO event_attendance (event_id, user_id, tagged_by, created_at) VALUES (?, ?, ?, ?)',
      [albumId, targetUserId, userId, now]
    );

    // Notify tagged friend
    run(
      'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [
        crypto.randomUUID(),
        targetUserId,
        'tagged_at_event',
        'Tagged at Event',
        `@${req.user!.username} tagged you as present at "${album.title}".`,
        `/album/${albumId}`,
        now,
      ]
    );
  } else {
    // Self marking "I was there"
    run(
      'INSERT OR IGNORE INTO event_attendance (event_id, user_id, tagged_by, created_at) VALUES (?, ?, NULL, ?)',
      [albumId, userId, now]
    );
  }

  res.json({ success: true });
});

albumsRouter.delete('/:id/attendance/:targetUserId', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const targetUserId = req.params.targetUserId;
  const isAdmin = req.user!.role === 'admin';

  const album = queryOne<any>('SELECT creator_id FROM albums WHERE id = ?', [albumId]);
  if (!album) return res.status(404).json({ error: 'Album not found' });

  // User can remove their own tag, or creator/admin can remove any
  if (targetUserId !== userId && album.creator_id !== userId && !isAdmin) {
    return res.status(403).json({ error: 'Permission denied to remove attendance' });
  }

  run('DELETE FROM event_attendance WHERE event_id = ? AND user_id = ?', [albumId, targetUserId]);
  res.json({ success: true });
});

// Event notes: "Notes are short texts shown after the last photo; the author picks each note's visibility and may post anonymously (hidden from friends, visible to admins)."
albumsRouter.get('/:id/notes', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const notes = queryAll<any>(
    `SELECT en.*, u.username, u.display_name, u.avatar_color
     FROM event_notes en
     JOIN users u ON en.author_id = u.id
     WHERE en.event_id = ?
     ORDER BY en.created_at ASC`,
    [albumId]
  );

  const sanitizedNotes = notes.map((n) => {
    const isAuthor = n.author_id === userId;
    const isAnonymous = Boolean(n.is_anonymous);

    // If anonymous and not admin and not author, hide username
    return {
      id: n.id,
      eventId: n.event_id,
      text: n.text,
      visibility: n.visibility,
      isAnonymous,
      createdAt: n.created_at,
      author:
        isAnonymous && !isAdmin && !isAuthor
          ? { id: 'anonymous', username: 'anonymous_friend', displayName: 'Anonymous Friend', avatarColor: '#64748b' }
          : { id: n.author_id, username: n.username, displayName: n.display_name, avatarColor: n.avatar_color },
      canDelete: isAuthor || isAdmin,
    };
  });

  res.json({ notes: sanitizedNotes });
});

albumsRouter.post('/:id/notes', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const { text, visibility, isAnonymous } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Note text is required' });
  }

  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    'INSERT INTO event_notes (id, event_id, author_id, text, visibility, is_anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [noteId, albumId, userId, text.trim(), visibility || 'group', isAnonymous ? 1 : 0, now]
  );

  res.status(201).json({ success: true, noteId });
});

// Delete album / collection
albumsRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const albumId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { permanent } = req.body || {};

  const album = queryOne<any>('SELECT * FROM albums WHERE id = ?', [albumId]);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  if (!isAdmin && album.creator_id !== userId) {
    return res.status(403).json({ error: 'Only the creator or an admin can delete this album' });
  }

  if (permanent || album.deleted_at) {
    run('DELETE FROM item_groups WHERE item_type = "album" AND item_id = ?', [albumId]);
    run('DELETE FROM comments WHERE target_type = "album" AND target_id = ?', [albumId]);
    run('DELETE FROM reactions WHERE target_type = "album" AND target_id = ?', [albumId]);
    run('DELETE FROM event_attendance WHERE event_id = ?', [albumId]);
    run('DELETE FROM event_notes WHERE event_id = ?', [albumId]);
    run('DELETE FROM album_items WHERE album_id = ?', [albumId]);
    run('DELETE FROM albums WHERE id = ?', [albumId]);
    return res.json({ success: true, message: 'Album permanently deleted' });
  } else {
    run('UPDATE albums SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), albumId]);
    return res.json({ success: true, message: 'Album moved to trash' });
  }
});

