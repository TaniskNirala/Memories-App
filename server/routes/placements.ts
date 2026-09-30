import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import { canUserViewPost } from './posts.ts';

export const placementsRouter = Router();
placementsRouter.use(requireApproved);

// Bunch share items into groups
// "Support bunch sharing: select several posts or a collection and share them into one or more groups at once."
placementsRouter.post('/bunch', async (req: AuthenticatedRequest, res) => {
  const { itemIds, itemType = 'post', groupIds } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: 'At least one item must be selected' });
  }

  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    return res.status(400).json({ error: 'At least one target circle must be selected' });
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let pendingCount = 0;

  for (const itemId of itemIds) {
    let ownerId = userId;

    if (itemType === 'post') {
      const access = canUserViewPost(userId, userRole, itemId);
      if (!access.canView) continue;
      ownerId = access.post.owner_id;
    } else {
      const album = queryOne<any>('SELECT creator_id FROM albums WHERE id = ?', [itemId]);
      if (!album) continue;
      ownerId = album.creator_id;
    }

    const isOwner = ownerId === userId || userRole === 'admin';

    for (const groupId of groupIds) {
      // Verify user is in this group
      const member = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
      if (!member && userRole !== 'admin') continue;

      // Check if already placed
      const existing = queryOne('SELECT id, reference_status FROM item_groups WHERE item_type = ? AND item_id = ? AND group_id = ?', [
        itemType,
        itemId,
        groupId,
      ]);

      if (existing) continue;

      const placementId = crypto.randomUUID();
      const isRef = isOwner ? 0 : 1;
      const refStatus = isOwner ? 'approved' : 'pending_owner_approval';

      run(
        `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [placementId, itemType, itemId, groupId, userId, isRef, refStatus, now]
      );

      if (isRef) {
        pendingCount++;
        // Notify owner
        const group = queryOne<any>('SELECT name FROM groups WHERE id = ?', [groupId]);
        run(
          `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            crypto.randomUUID(),
            ownerId,
            'reference_request',
            'Photo reference requested',
            `@${req.user!.username} wants to share your memory into "${group?.name || 'a circle'}". Review to allow.`,
            '/notifications',
            now,
          ]
        );
      } else {
        createdCount++;
      }
    }
  }

  res.json({
    success: true,
    createdCount,
    pendingCount,
    message:
      pendingCount > 0
        ? `Shared into groups. ${pendingCount} reference(s) sent to owner for approval.`
        : 'Shared successfully into groups.',
  });
});

// Remove item from a specific group
// "An owner can remove a post from one group without deleting it elsewhere."
placementsRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const placementId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const placement = queryOne<any>(
    `SELECT ig.*, p.owner_id as post_owner, a.creator_id as album_owner, g.creator_id as group_creator
     FROM item_groups ig
     LEFT JOIN posts p ON ig.item_type = 'post' AND ig.item_id = p.id
     LEFT JOIN albums a ON ig.item_type = 'album' AND ig.item_id = a.id
     JOIN groups g ON ig.group_id = g.id
     WHERE ig.id = ?`,
    [placementId]
  );

  if (!placement) return res.status(404).json({ error: 'Placement not found' });

  const isOwner = placement.post_owner === userId || placement.album_owner === userId;
  const isAdder = placement.added_by === userId;
  const isGroupCreator = placement.group_creator === userId;
  const isAdmin = userRole === 'admin';

  if (!isOwner && !isAdder && !isGroupCreator && !isAdmin) {
    return res.status(403).json({ error: 'Permission denied to remove placement' });
  }

  run('DELETE FROM item_groups WHERE id = ?', [placementId]);
  res.json({ success: true, message: 'Removed from group' });
});

// List pending references for the current user (where current user is the owner)
placementsRouter.get('/pending-references', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const requests = queryAll<any>(
    `SELECT ig.id as placement_id, ig.item_type, ig.item_id, ig.group_id, ig.added_at,
            g.name as group_name,
            u.username as requester_username, u.display_name as requester_display_name,
            p.caption, pf.thumb_key, pf.storage_key
     FROM item_groups ig
     JOIN groups g ON ig.group_id = g.id
     JOIN users u ON ig.added_by = u.id
     JOIN posts p ON ig.item_type = 'post' AND ig.item_id = p.id
     LEFT JOIN post_files pf ON pf.post_id = p.id AND pf.position = 0
     WHERE ig.is_reference = 1 AND ig.reference_status = 'pending_owner_approval' AND p.owner_id = ?
     ORDER BY ig.added_at DESC`,
    [userId]
  );

  res.json({ requests });
});

// Owner decides on reference request
// "until the owner allows it, so nobody's photos reach a wider audience without the owner's say."
placementsRouter.post('/pending-references/:placementId/decide', (req: AuthenticatedRequest, res) => {
  const placementId = req.params.placementId;
  const userId = req.user!.id;
  const { decision } = req.body; // 'approved' or 'rejected'

  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }

  const placement = queryOne<any>(
    `SELECT ig.*, p.owner_id, g.name as group_name
     FROM item_groups ig
     JOIN posts p ON ig.item_id = p.id
     JOIN groups g ON ig.group_id = g.id
     WHERE ig.id = ?`,
    [placementId]
  );

  if (!placement) return res.status(404).json({ error: 'Reference request not found' });
  if (placement.owner_id !== userId && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Only the item owner can decide on reference requests' });
  }

  const now = new Date().toISOString();
  run('UPDATE item_groups SET reference_status = ? WHERE id = ?', [decision, placementId]);

  // Notify requester
  run(
    `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      crypto.randomUUID(),
      placement.added_by,
      'reference_approved',
      decision === 'approved' ? 'Reference Request Approved' : 'Reference Request Declined',
      `@${req.user!.username} ${decision === 'approved' ? 'approved' : 'declined'} sharing the photo into "${placement.group_name}".`,
      `/group/${placement.group_id}`,
      now,
    ]
  );

  res.json({ success: true, decision });
});
