import { queryOne, queryAll } from '../db.ts';
import type { Row } from '../rows.ts';

// Helper to check if a user can view a post
export function canUserViewPost(
  userId: string,
  userRole: string,
  postId: string
): { canView: boolean; isOwner: boolean; isLockedReference: boolean; lockedReason?: string; post?: Row } {
  const post = queryOne<Row>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return { canView: false, isOwner: false, isLockedReference: false };

  const isOwner = post.owner_id === userId;
  const isAdmin = userRole === 'admin';

  // Soft-deleted posts only viewable by owner or admin
  if (post.deleted_at && !isOwner && !isAdmin) {
    return { canView: false, isOwner, isLockedReference: false };
  }

  // Admin visibility override check
  if (post.visibility_override === 'hidden' && !isAdmin && !isOwner) {
    return { canView: false, isOwner, isLockedReference: false };
  }
  if (post.visibility_override === 'public_all') {
    return { canView: true, isOwner, isLockedReference: false, post };
  }

  // Admins and owners can always view
  if (isAdmin || isOwner) {
    return { canView: true, isOwner, isLockedReference: false, post };
  }

  // Check placements in groups user is a member of
  const placements = queryAll<Row>(
    `SELECT ig.*, g.name as group_name
     FROM item_groups ig
     JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
     JOIN groups g ON ig.group_id = g.id
     WHERE ig.item_type = 'post' AND ig.item_id = ?`,
    [userId, postId]
  );

  if (placements.length === 0) {
    // If not placed in any group user belongs to, check if in an album user can see
    const albumPlacements = queryAll<Row>(
      `SELECT ai.album_id
       FROM album_items ai
       JOIN item_groups ig ON ig.item_type = 'album' AND ig.item_id = ai.album_id
       JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
       WHERE ai.post_id = ?`,
      [userId, postId]
    );
    if (albumPlacements.length === 0) {
      return { canView: false, isOwner: false, isLockedReference: false };
    }
    return { canView: true, isOwner: false, isLockedReference: false, post };
  }

  // Check if all placements available to this user are pending references
  const nonPending = placements.filter((p) => !p.is_reference || p.reference_status === 'approved');
  if (nonPending.length > 0) {
    return { canView: true, isOwner: false, isLockedReference: false, post };
  }

  // User only sees this post via a pending reference!
  const ownerUser = queryOne<Row>('SELECT username, display_name FROM users WHERE id = ?', [post.owner_id]);
  return {
    canView: false,
    isOwner: false,
    isLockedReference: true,
    lockedReason: `Shared from another circle. Pending approval by owner @${ownerUser?.username || 'user'}`,
    post,
  };
}
