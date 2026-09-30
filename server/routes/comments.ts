import { Router } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';

export const commentsRouter = Router();
commentsRouter.use(requireApproved);

// Helper to check membership
function isUserInGroup(userId: string, groupId: string, userRole: string): boolean {
  if (userRole === 'admin') return true;
  const member = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
  return Boolean(member);
}

// Get comments for a post/album within a specific group placement
// "comments belong to a post IN ONE GROUP (placement), so a chat in a group of two stays private to those two."
commentsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const { targetType = 'post', targetId, groupId } = req.query as { targetType?: string; targetId?: string; groupId?: string };
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!targetId || !groupId) {
    return res.status(400).json({ error: 'targetId and groupId are required' });
  }

  if (!isUserInGroup(userId, groupId, userRole)) {
    return res.status(403).json({ error: 'You are not a member of this circle' });
  }

  const comments = queryAll<any>(
    `SELECT c.*, u.username, u.display_name, u.avatar_color
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.target_type = ? AND c.target_id = ? AND c.group_id = ?
     ORDER BY c.created_at ASC`,
    [targetType, targetId, groupId]
  );

  const formatted = comments.map((c) => {
    const isDeleted = Boolean(c.deleted_at);
    const isAuthor = c.author_id === userId;
    const canDelete = isAuthor || userRole === 'admin';
    const canEdit = isAuthor && !isDeleted;

    return {
      id: c.id,
      targetType: c.target_type,
      targetId: c.target_id,
      groupId: c.group_id,
      parentId: c.parent_id,
      text: isDeleted ? '[deleted comment]' : c.text,
      isDeleted,
      editedAt: c.edited_at,
      createdAt: c.created_at,
      author: {
        id: c.author_id,
        username: c.username,
        displayName: c.display_name,
        avatarColor: c.avatar_color,
      },
      canDelete,
      canEdit,
    };
  });

  res.json({ comments: formatted });
});

// Post comment within a specific group placement
commentsRouter.post('/', (req: AuthenticatedRequest, res) => {
  const { targetType = 'post', targetId, groupId, text, parentId } = req.body;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!targetId || !groupId || !text || !text.trim()) {
    return res.status(400).json({ error: 'targetId, groupId and text are required' });
  }

  if (!isUserInGroup(userId, groupId, userRole)) {
    return res.status(403).json({ error: 'You are not a member of this circle' });
  }

  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanText = text.trim();

  run(
    `INSERT INTO comments (id, target_type, target_id, group_id, author_id, text, parent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [commentId, targetType, targetId, groupId, userId, cleanText, parentId || null, now]
  );

  // Parse @mentions
  // "Typing @ suggests only usernames of members of that group. Mentions create notifications."
  const mentionMatches = cleanText.match(/@([a-z0-9_-]+)/gi);
  if (mentionMatches) {
    const uniqueUsernames = Array.from(new Set(mentionMatches.map((m: string) => m.substring(1).toLowerCase())));
    for (const uname of uniqueUsernames) {
      // Find user who is in THIS group
      const targetUser = queryOne<any>(
        `SELECT u.id, u.username
         FROM users u
         JOIN group_members gm ON u.id = gm.user_id
         WHERE u.username = ? AND gm.group_id = ? AND u.status = 'active'`,
        [uname, groupId]
      );

      if (targetUser && targetUser.id !== userId) {
        run('INSERT INTO mentions (id, comment_id, mentioned_user_id, created_at) VALUES (?, ?, ?, ?)', [
          crypto.randomUUID(),
          commentId,
          targetUser.id,
          now,
        ]);

        const group = queryOne<any>('SELECT name FROM groups WHERE id = ?', [groupId]);
        run(
          `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            crypto.randomUUID(),
            targetUser.id,
            'mention',
            'New Mention',
            `@${req.user!.username} mentioned you in "${group?.name || 'circle'}": "${cleanText.slice(0, 50)}..."`,
            `/${targetType}/${targetId}?group=${groupId}`,
            now,
          ]
        );
      }
    }
  }

  // Also notify post owner if they are not the author
  if (targetType === 'post') {
    const post = queryOne<any>('SELECT owner_id FROM posts WHERE id = ?', [targetId]);
    if (post && post.owner_id !== userId) {
      run(
        `INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          crypto.randomUUID(),
          post.owner_id,
          'comment',
          'New Comment',
          `@${req.user!.username} commented on your memory: "${cleanText.slice(0, 50)}..."`,
          `/post/${targetId}?group=${groupId}`,
          now,
        ]
      );
    }
  }

  res.status(201).json({ success: true, commentId });
});

// Edit comment
commentsRouter.patch('/:id', (req: AuthenticatedRequest, res) => {
  const commentId = req.params.id;
  const userId = req.user!.id;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text required' });
  }

  const comment = queryOne<any>('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.author_id !== userId) {
    return res.status(403).json({ error: 'You can only edit your own comments' });
  }
  if (comment.deleted_at) {
    return res.status(400).json({ error: 'Cannot edit deleted comment' });
  }

  run('UPDATE comments SET text = ?, edited_at = ? WHERE id = ?', [text.trim(), new Date().toISOString(), commentId]);
  res.json({ success: true });
});

// Soft-delete comment
// "threaded, edit and soft-delete own, admin can delete any"
commentsRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const commentId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const comment = queryOne<any>('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  if (comment.author_id !== userId && userRole !== 'admin') {
    return res.status(403).json({ error: 'Permission denied to delete comment' });
  }

  run('UPDATE comments SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), commentId]);
  res.json({ success: true });
});

// Get members of a group for @mention auto-complete
commentsRouter.get('/group-members/:groupId', (req: AuthenticatedRequest, res) => {
  const groupId = req.params.groupId;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  if (!isUserInGroup(userId, groupId, userRole)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const members = queryAll<any>(
    `SELECT u.id, u.username, u.display_name, u.avatar_color
     FROM group_members gm
     JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ? AND u.status = 'active'
     ORDER BY u.display_name ASC`,
    [groupId]
  );

  res.json({ members });
});
