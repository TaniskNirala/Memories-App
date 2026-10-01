import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved, requireAdmin } from '../middleware/auth.ts';
import { getStorageAdapter } from '../storage/index.ts';

// Multer disk storage setup for reliable multipart file uploads
const uploadsBaseDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsBaseDir)) {
  fs.mkdirSync(uploadsBaseDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req: any, _file, cb) => {
    const userId = req.user?.id || 'anon';
    const userDir = path.join(uploadsBaseDir, 'posts', userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500 MB limit
});

export const postsRouter = Router();
postsRouter.use(requireApproved);

// Helper to check if a user can view a post
export function canUserViewPost(
  userId: string,
  userRole: string,
  postId: string
): { canView: boolean; isOwner: boolean; isLockedReference: boolean; lockedReason?: string; post?: any } {
  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
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
  const placements = queryAll<any>(
    `SELECT ig.*, g.name as group_name
     FROM item_groups ig
     JOIN group_members gm ON ig.group_id = gm.group_id AND gm.user_id = ?
     JOIN groups g ON ig.group_id = g.id
     WHERE ig.item_type = 'post' AND ig.item_id = ?`,
    [userId, postId]
  );

  if (placements.length === 0) {
    // If not placed in any group user belongs to, check if in an album user can see
    const albumPlacements = queryAll<any>(
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
  const ownerUser = queryOne<any>('SELECT username, display_name FROM users WHERE id = ?', [post.owner_id]);
  return {
    canView: false,
    isOwner: false,
    isLockedReference: true,
    lockedReason: `Shared from another circle. Pending approval by owner @${ownerUser?.username || 'user'}`,
    post,
  };
}

// Direct multipart file upload endpoint (streamed directly to disk via multer)
postsRouter.post(
  '/upload-file',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const mainFile = files?.file?.[0];
      const thumbFile = files?.thumb?.[0];

      if (!mainFile) {
        return res.status(400).json({ error: 'No main file received' });
      }

      const userId = req.user!.id;
      const mainStorageKey = `posts/${userId}/${mainFile.filename}`;
      const thumbStorageKey = thumbFile ? `posts/${userId}/${thumbFile.filename}` : mainStorageKey;

      // If cloud storage backend is configured, sync uploaded buffers to cloud safely
      const storage = getStorageAdapter();
      const backend = process.env.STORAGE_BACKEND;
      if (backend === 's3' || backend === 'r2') {
        try {
          const fileBuf = fs.readFileSync(mainFile.path);
          await storage.putObject(mainStorageKey, fileBuf, mainFile.mimetype);
          if (thumbFile) {
            const thumbBuf = fs.readFileSync(thumbFile.path);
            await storage.putObject(thumbStorageKey, thumbBuf, thumbFile.mimetype);
          }
        } catch (cloudErr: any) {
          console.error('⚠️ Cloud storage sync warning (file safely saved on disk):', cloudErr.message);
        }
      }

      const fileType = mainFile.mimetype.startsWith('video')
        ? 'video'
        : mainFile.mimetype.startsWith('audio')
        ? 'audio'
        : 'photo';

      const width = parseInt(req.body.width, 10) || 1200;
      const height = parseInt(req.body.height, 10) || 800;

      res.json({
        success: true,
        storageKey: mainStorageKey,
        thumbKey: thumbStorageKey,
        fileType,
        mimeType: mainFile.mimetype,
        fileSize: mainFile.size,
        width,
        height,
      });
    } catch (err: any) {
      console.error('File upload error:', err);
      res.status(500).json({ error: err.message || 'File upload failed' });
    }
  }
);

// Generate signed upload URLs for browser direct upload
postsRouter.post('/signed-upload-urls', async (req: AuthenticatedRequest, res) => {
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Files array required' });
  }

  const storage = getStorageAdapter();
  const userId = req.user!.id;
  const results: any[] = [];

  for (const f of files) {
    const ext = (f.fileName || 'file').split('.').pop() || 'bin';
    const uuid = crypto.randomUUID();
    const mainStorageKey = `posts/${userId}/${Date.now()}_${uuid}.${ext}`;
    const thumbStorageKey = `posts/${userId}/${Date.now()}_${uuid}_thumb.jpg`;

    const mainUpload = await storage.getSignedUploadUrl(mainStorageKey, f.mimeType || 'application/octet-stream');
    const thumbUpload = await storage.getSignedUploadUrl(thumbStorageKey, 'image/jpeg');

    results.push({
      fileName: f.fileName,
      mainUploadUrl: mainUpload.uploadUrl,
      mainStorageKey,
      mainMethod: mainUpload.method,
      mainHeaders: mainUpload.headers,
      thumbUploadUrl: thumbUpload.uploadUrl,
      thumbStorageKey,
      thumbMethod: thumbUpload.method,
      thumbHeaders: thumbUpload.headers,
    });
  }

  res.json({ uploads: results });
});

// Create post after files have been uploaded directly to storage
postsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { caption, takenAt, uploadedAt, dateBasis, groupIds, files, albumId } = req.body;
  const userId = req.user!.id;

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Post must have at least one file' });
  }

  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const postTakenAt = takenAt || now;
  const postUploadedAt = uploadedAt || now;
  const postDateBasis = dateBasis === 'uploaded_at' ? 'uploaded_at' : 'taken_at';

  run(
    `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, deleted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      postId,
      userId,
      caption?.trim() || null,
      postTakenAt,
      postUploadedAt,
      postDateBasis,
      albumId ? 0 : 1,
      now,
    ]
  );

  // Insert files
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fileId = crypto.randomUUID();
    run(
      `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        postId,
        f.storageKey,
        f.fileType || 'photo',
        i,
        f.thumbKey || f.storageKey,
        f.fileSize || 0,
        f.mimeType || 'image/jpeg',
        f.width || null,
        f.height || null,
      ]
    );
  }

  // If associated with an album, link it
  if (albumId) {
    const existingCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM album_items WHERE album_id = ?', [albumId]);
    run('INSERT INTO album_items (album_id, post_id, position, added_at) VALUES (?, ?, ?, ?)', [
      albumId,
      postId,
      existingCount?.count || 0,
      now,
    ]);
  }

  // Share into selected groups (placements)
  const targetGroups = Array.isArray(groupIds) ? groupIds : [];
  for (const gId of targetGroups) {
    // Verify user is in group or admin
    const member = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [gId, userId]);
    if (member || req.user!.role === 'admin') {
      const placementId = crypto.randomUUID();
      run(
        `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
         VALUES (?, 'post', ?, ?, ?, 0, 'approved', ?)`,
        [placementId, postId, gId, userId, now]
      );
    }
  }

  res.status(201).json({ success: true, postId });
});

// Get post detail with signed view URLs
postsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const access = canUserViewPost(userId, userRole, postId);

  if (access.isLockedReference) {
    const owner = queryOne<any>('SELECT username, display_name FROM users WHERE id = ?', [access.post.owner_id]);
    return res.json({
      isLocked: true,
      lockedReason: access.lockedReason,
      ownerUsername: owner?.username,
      ownerDisplayName: owner?.display_name,
      postId,
    });
  }

  if (!access.canView || !access.post) {
    return res.status(404).json({ error: 'Post not found or access denied' });
  }

  const post = access.post;
  const storage = getStorageAdapter();

  const rawFiles = queryAll<any>('SELECT * FROM post_files WHERE post_id = ? ORDER BY position ASC', [postId]);
  const filesWithUrls = await Promise.all(
    rawFiles.map(async (f) => ({
      id: f.id,
      storageKey: f.storage_key,
      fileType: f.file_type,
      position: f.position,
      fileSize: f.file_size,
      mimeType: f.mime_type,
      width: f.width,
      height: f.height,
      viewUrl: await storage.getSignedViewUrl(f.storage_key),
      thumbUrl: await storage.getSignedViewUrl(f.thumb_key),
    }))
  );

  const owner = queryOne<any>('SELECT id, username, display_name, avatar_color FROM users WHERE id = ?', [post.owner_id]);

  // Placements for this post
  const placements = queryAll<any>(
    `SELECT ig.*, g.name as group_name
     FROM item_groups ig
     JOIN groups g ON ig.group_id = g.id
     WHERE ig.item_type = 'post' AND ig.item_id = ?`,
    [postId]
  );

  res.json({
    post: {
      id: post.id,
      caption: post.caption,
      takenAt: post.taken_at,
      uploadedAt: post.uploaded_at,
      dateBasis: post.date_basis,
      isStandalone: Boolean(post.is_standalone),
      deletedAt: post.deleted_at,
      visibilityOverride: post.visibility_override,
      createdAt: post.created_at,
      isOwner: access.isOwner,
      canEdit: access.isOwner || userRole === 'admin',
      owner: {
        id: owner.id,
        username: owner.username,
        displayName: owner.display_name,
        avatarColor: owner.avatar_color,
      },
      files: filesWithUrls,
      placements: placements.map((p) => ({
        id: p.id,
        groupId: p.group_id,
        groupName: p.group_name,
        isReference: Boolean(p.is_reference),
        referenceStatus: p.reference_status,
      })),
    },
  });
});

// Update post caption / date basis
postsRouter.patch('/:id', (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { caption, takenAt, dateBasis } = req.body;

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Only the author or an admin can edit this post' });
  }

  run(
    'UPDATE posts SET caption = ?, taken_at = COALESCE(?, taken_at), date_basis = COALESCE(?, date_basis) WHERE id = ?',
    [caption !== undefined ? caption : post.caption, takenAt || null, dateBasis || null, postId]
  );

  res.json({ success: true });
});

// Delete post: "The owner chooses each time between 'Move to trash' (recoverable for 30 days) and 'Delete forever'."
postsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { permanent } = req.body || {};

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Only the owner or an admin can delete this post' });
  }

  if (permanent || post.deleted_at) {
    // Delete forever: remove files from storage adapter and delete DB records
    const files = queryAll<any>('SELECT storage_key, thumb_key FROM post_files WHERE post_id = ?', [postId]);
    const storage = getStorageAdapter();
    for (const f of files) {
      await storage.deleteObject(f.storage_key).catch(() => {});
      if (f.thumb_key !== f.storage_key) {
        await storage.deleteObject(f.thumb_key).catch(() => {});
      }
    }

    run('DELETE FROM item_groups WHERE item_type = "post" AND item_id = ?', [postId]);
    run('DELETE FROM comments WHERE target_type = "post" AND target_id = ?', [postId]);
    run('DELETE FROM reactions WHERE target_type = "post" AND target_id = ?', [postId]);
    run('DELETE FROM album_items WHERE post_id = ?', [postId]);
    run('DELETE FROM post_files WHERE post_id = ?', [postId]);
    run('DELETE FROM posts WHERE id = ?', [postId]);

    if (isAdmin && post.owner_id !== userId) {
      run(
        'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), userId, 'content_deleted', 'post', postId, 'Permanently deleted by admin', new Date().toISOString()]
      );
    }

    return res.json({ success: true, message: 'Post permanently deleted' });
  } else {
    // Move to trash (30 day soft delete)
    run('UPDATE posts SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), postId]);
    return res.json({ success: true, message: 'Moved to trash' });
  }
});

// Restore post from trash
postsRouter.post('/:id/restore', (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  run('UPDATE posts SET deleted_at = NULL WHERE id = ?', [postId]);
  res.json({ success: true, message: 'Post restored' });
});

// List items in trash for current user
postsRouter.get('/trash/list', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const sql = isAdmin
    ? 'SELECT * FROM posts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    : 'SELECT * FROM posts WHERE deleted_at IS NOT NULL AND owner_id = ? ORDER BY deleted_at DESC';

  const posts = queryAll<any>(sql, isAdmin ? [] : [userId]);
  res.json({ trash: posts });
});

// Admin visibility override
// "Admins can override the visibility of any item; every override is written to an audit log and the owner is notified."
postsRouter.post('/:id/override-visibility', requireAdmin, (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const adminId = req.user!.id;
  const { override } = req.body; // 'public_all', 'hidden', or null

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const validOverrides = ['public_all', 'hidden', null];
  if (!validOverrides.includes(override)) {
    return res.status(400).json({ error: 'Invalid override state' });
  }

  const now = new Date().toISOString();
  run('UPDATE posts SET visibility_override = ? WHERE id = ?', [override, postId]);

  // Log in audit log
  run(
    'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      crypto.randomUUID(),
      adminId,
      'admin_visibility_override',
      'post',
      postId,
      `Admin set visibility override to "${override}"`,
      now,
    ]
  );

  // Notify owner
  if (post.owner_id !== adminId) {
    run(
      'INSERT INTO notifications (id, user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [
        crypto.randomUUID(),
        post.owner_id,
        'admin_override',
        'Post visibility updated by Admin',
        `An administrator updated the visibility of your post to: ${override || 'standard group permissions'}.`,
        `/post/${postId}`,
        now,
      ]
    );
  }

  res.json({ success: true, visibilityOverride: override });
});
