import { Router } from 'express';
import { queryOne, queryAll } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import { getStorageAdapter } from '../storage/index.ts';
import { avatarUrlFor } from '../security/avatars.ts';

export const feedRouter = Router();
feedRouter.use(requireApproved);

feedRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const isAdmin = userRole === 'admin';

  const filter = (req.query.filter as string) || 'all'; // 'all', 'collections', 'single'
  const groupId = req.query.groupId as string;
  const cursor = req.query.cursor as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 15, 30);

  const storage = getStorageAdapter();

  // If groupId is specified, ensure user has access
  if (groupId && !isAdmin) {
    const isMember = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }
  }

  // 1. Fetch Single Posts (posts where is_standalone = 1 and deleted_at IS NULL)
  let postSql = `
    SELECT DISTINCT p.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar_color as owner_avatar_color, u.avatar_url as owner_avatar_url,
      CASE WHEN p.date_basis = 'uploaded_at' THEN p.uploaded_at ELSE p.taken_at END as sort_date
    FROM posts p
    JOIN users u ON p.owner_id = u.id
    LEFT JOIN item_groups ig ON ig.item_type = 'post' AND ig.item_id = p.id
    LEFT JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
    WHERE p.deleted_at IS NULL AND p.is_standalone = 1
  `;
  const postParams: any[] = [userId];

  if (groupId) {
    postSql += ` AND ig.group_id = ?`;
    postParams.push(groupId);
  } else if (!isAdmin) {
    postSql += ` AND (p.owner_id = ? OR gm.user_id = ? OR p.visibility_override = 'public_all')`;
    postParams.push(userId, userId);
  }

  if (cursor) {
    postSql += ` AND (CASE WHEN p.date_basis = 'uploaded_at' THEN p.uploaded_at ELSE p.taken_at END) < ?`;
    postParams.push(cursor);
  }

  postSql += ` ORDER BY sort_date DESC LIMIT ?`;
  postParams.push(limit);

  // 2. Fetch Collection Cards (albums where status = 'approved')
  let albumSql = `
    SELECT DISTINCT a.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_color as creator_avatar_color, u.avatar_url as creator_avatar_url,
      COALESCE(a.event_date, a.created_at) as sort_date,
      COALESCE((
        SELECT COUNT(pf.id)
        FROM album_items ai
        JOIN posts p ON ai.post_id = p.id AND p.deleted_at IS NULL
        JOIN post_files pf ON pf.post_id = p.id
        WHERE ai.album_id = a.id
      ), (SELECT COUNT(*) FROM album_items ai WHERE ai.album_id = a.id), 0) as item_count
    FROM albums a
    JOIN users u ON a.creator_id = u.id
    LEFT JOIN item_groups ig ON ig.item_type = 'album' AND ig.item_id = a.id
    LEFT JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
    WHERE a.status = 'approved' AND a.deleted_at IS NULL
  `;
  const albumParams: any[] = [userId];

  if (groupId) {
    albumSql += ` AND ig.group_id = ?`;
    albumParams.push(groupId);
  } else if (!isAdmin) {
    albumSql += ` AND (a.creator_id = ? OR gm.user_id = ?)`;
    albumParams.push(userId, userId);
  }

  if (cursor) {
    albumSql += ` AND COALESCE(a.event_date, a.created_at) < ?`;
    albumParams.push(cursor);
  }

  albumSql += ` ORDER BY sort_date DESC LIMIT ?`;
  albumParams.push(limit);

  // Execute queries based on filter
  let posts: any[] = [];
  let albums: any[] = [];

  if (filter === 'all' || filter === 'single') {
    posts = queryAll<any>(postSql, postParams);
  }
  if (filter === 'all' || filter === 'collections') {
    albums = queryAll<any>(albumSql, albumParams);
  }

  // Format single posts
  const formattedPosts = await Promise.all(
    posts.map(async (p) => {
      // Check if locked placeholder applies to current user
      const isOwner = p.owner_id === userId;
      let isLocked = false;
      let lockedReason = '';

      if (!isOwner && !isAdmin) {
        // Find placements user can see
        const userPlacements = queryAll<any>(
          `SELECT ig.*
           FROM item_groups ig
           JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
           WHERE ig.item_type = 'post' AND ig.item_id = ?`,
          [userId, p.id]
        );

        const hasApprovedPlacement = userPlacements.some((up) => !up.is_reference || up.reference_status === 'approved');
        if (!hasApprovedPlacement && userPlacements.length > 0) {
          isLocked = true;
          lockedReason = `Shared from another circle. Pending approval by owner @${p.owner_username}`;
        }
      }

      if (isLocked) {
        const placements = queryAll<any>(
          `SELECT ig.id, ig.group_id as groupId, g.name as groupName, ig.is_reference as isReference, ig.reference_status as referenceStatus
           FROM item_groups ig
           JOIN groups g ON ig.group_id = g.id
           JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
           WHERE ig.item_type = 'post' AND ig.item_id = ?`,
          [userId, p.id]
        );
        const targetGroupName = placements[0]?.groupName || 'this circle';
        return {
          type: 'single_post',
          id: p.id,
          sortDate: p.sort_date,
          takenAt: p.taken_at,
          uploadedAt: p.uploaded_at,
          dateBasis: p.date_basis,
          isLockedPlaceholder: true,
          lockedReason: `${p.owner_display_name || p.owner_username} hasn't approved sharing this to ${targetGroupName} yet.`,
          owner: {
            id: p.owner_id,
            username: p.owner_username,
            displayName: p.owner_display_name,
            avatarColor: p.owner_avatar_color,
            avatarUrl: avatarUrlFor(p.owner_avatar_url),
          },
          caption: p.caption,
          placements,
          files: [],
          commentsCount: 0,
          reactions: [],
        };
      }

      // Load files with signed URLs
      const rawFiles = queryAll<any>('SELECT * FROM post_files WHERE post_id = ? ORDER BY position ASC', [p.id]);
      const filesWithUrls = await Promise.all(
        rawFiles.map(async (f) => ({
          id: f.id,
          fileType: f.file_type,
          position: f.position,
          storageKey: f.storage_key,
          thumbUrl: await storage.getSignedViewUrl(f.thumb_key || f.storage_key),
          viewUrl: await storage.getSignedViewUrl(f.storage_key),
          width: f.width,
          height: f.height,
          tgDeleted: Boolean(f.tg_deleted_at),
          tgDeletedAt: f.tg_deleted_at || null,
        }))
      );

      // Placements & comments count
      const placements = queryAll<any>(
        isAdmin || isOwner
          ? `SELECT ig.id, ig.group_id as groupId, g.name as groupName, ig.is_reference as isReference, ig.reference_status as referenceStatus
             FROM item_groups ig
             JOIN groups g ON ig.group_id = g.id
             WHERE ig.item_type = 'post' AND ig.item_id = ?`
          : `SELECT ig.id, ig.group_id as groupId, g.name as groupName, ig.is_reference as isReference, ig.reference_status as referenceStatus
             FROM item_groups ig
             JOIN groups g ON ig.group_id = g.id
             JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
             WHERE ig.item_type = 'post' AND ig.item_id = ?`,
        isAdmin || isOwner ? [p.id] : [userId, p.id]
      );

      // Target group for comments/reactions
      const activeGroupId = groupId || placements[0]?.groupId || placements[0]?.group_id;

      let commentsCount = 0;
      let reactions: any[] = [];

      if (activeGroupId) {
        const cCount = queryOne<{ count: number }>(
          "SELECT COUNT(*) as count FROM comments WHERE target_type = 'post' AND target_id = ? AND group_id = ? AND deleted_at IS NULL",
          [p.id, activeGroupId]
        );
        commentsCount = cCount?.count || 0;

        const reactRows = queryAll<any>(
          `SELECT emoji, COUNT(*) as count,
                  MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as user_reacted
           FROM reactions
           WHERE target_type = 'post' AND target_id = ? AND group_id = ?
           GROUP BY emoji`,
          [userId, p.id, activeGroupId]
        );
        reactions = reactRows.map((r) => ({
          emoji: r.emoji,
          count: r.count,
          userReacted: Boolean(r.user_reacted),
        }));
      }

      return {
        type: 'single_post',
        id: p.id,
        caption: p.caption,
        takenAt: p.taken_at,
        uploadedAt: p.uploaded_at,
        dateBasis: p.date_basis,
        sortDate: p.sort_date,
        isOwner,
        owner: {
          id: p.owner_id,
          username: p.owner_username,
          displayName: p.owner_display_name,
          avatarColor: p.owner_avatar_color,
          avatarUrl: avatarUrlFor(p.owner_avatar_url),
        },
        files: filesWithUrls,
        placements,
        activeGroupId,
        commentsCount,
        reactions,
      };
    })
  );

  // Format collection cards
  const formattedAlbums = await Promise.all(
    albums.map(async (alb) => {
      // Cover mosaic (up to 4 thumbnails across all posts in the album)
      const topThumbnails = queryAll<any>(
        `SELECT pf.thumb_key, pf.storage_key
         FROM album_items ai
         JOIN posts p ON ai.post_id = p.id AND p.deleted_at IS NULL
         JOIN post_files pf ON pf.post_id = p.id
         WHERE ai.album_id = ?
         ORDER BY ai.position ASC, pf.position ASC LIMIT 4`,
        [alb.id]
      );

      const mosaicUrls = await Promise.all(
        topThumbnails.map((t) => storage.getSignedViewUrl(t.thumb_key || t.storage_key))
      );

      // Attendance count if event
      let attendeesCount = 0;
      let userAttended = false;
      if (alb.is_event) {
        const attCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM event_attendance WHERE event_id = ?', [alb.id]);
        attendeesCount = attCount?.count || 0;
        const myAtt = queryOne('SELECT user_id FROM event_attendance WHERE event_id = ? AND user_id = ?', [alb.id, userId]);
        userAttended = Boolean(myAtt);
      }

      // Group placement
      const placements = queryAll<any>(
        `SELECT ig.id, ig.group_id as groupId, g.name as groupName
         FROM item_groups ig
         JOIN groups g ON ig.group_id = g.id
         WHERE ig.item_type = 'album' AND ig.item_id = ?`,
        [alb.id]
      );

      return {
        type: 'collection_card',
        id: alb.id,
        title: alb.title,
        description: alb.description,
        isEvent: Boolean(alb.is_event),
        eventDate: alb.event_date,
        eventPlace: alb.event_place,
        sortDate: alb.sort_date,
        itemCount: alb.item_count,
        mosaicUrls,
        creator: {
          id: alb.creator_id,
          username: alb.creator_username,
          displayName: alb.creator_display_name,
          avatarColor: alb.creator_avatar_color,
          avatarUrl: avatarUrlFor(alb.creator_avatar_url),
        },
        attendeesCount,
        userAttended,
        placements,
        activeGroupId: groupId || placements[0]?.groupId || placements[0]?.group_id,
      };
    })
  );

  // Combine and sort by sortDate descending
  const combined = [...formattedPosts, ...formattedAlbums]
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    .slice(0, limit);

  const nextCursor = combined.length === limit ? combined[combined.length - 1].sortDate : null;

  // Recently added strip: top 8 most recently uploaded photos across circles
  let recentStripSql = `
    SELECT p.id, p.caption, p.uploaded_at, pf.thumb_key, pf.storage_key, u.display_name as owner_name
    FROM posts p
    JOIN post_files pf ON pf.post_id = p.id AND pf.position = 0
    JOIN users u ON p.owner_id = u.id
    LEFT JOIN item_groups ig ON ig.item_type = 'post' AND ig.item_id = p.id
    LEFT JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
    WHERE p.deleted_at IS NULL
  `;
  const recentParams: any[] = [userId];

  if (!isAdmin) {
    recentStripSql += ` AND (p.owner_id = ? OR (gm.user_id = ? AND (ig.is_reference = 0 OR ig.reference_status = 'approved')))`;
    recentParams.push(userId, userId);
  }

  recentStripSql += ` ORDER BY p.uploaded_at DESC LIMIT 8`;

  const recentRows = queryAll<any>(recentStripSql, recentParams);
  const recentlyAdded = await Promise.all(
    recentRows.map(async (r) => ({
      postId: r.id,
      caption: r.caption,
      ownerName: r.owner_name,
      uploadedAt: r.uploaded_at,
      thumbUrl: await storage.getSignedViewUrl(r.thumb_key || r.storage_key),
    }))
  );

  res.json({
    items: combined,
    nextCursor,
    recentlyAdded,
  });
});
