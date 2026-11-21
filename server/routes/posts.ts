import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { queryOne, queryAll, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved, requireAdmin } from '../middleware/auth.ts';
import { getStorageAdapter, getStorageCapabilities, isCloudStorageBackend, isTelegramKey } from '../storage/index.ts';
import { syncStorageToDatabase } from '../storage/sync.ts';
import { isDeleteProtected } from '../config.ts';

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
    if (file.fieldname === 'thumb') {
      cb(null, `${Date.now()}_${crypto.randomUUID()}_thumb${ext}`);
    } else {
      cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
    }
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB limit for MTProto Telegram video support
});

// Active SSE upload progress listeners keyed by uploadId (NotaForge two-phase progress)
const uploadProgressClients = new Map<string, any>();

function emitUploadProgress(uploadId: string | null, pct: number): void {
  if (!uploadId) return;
  const clientRes = uploadProgressClients.get(uploadId);
  if (clientRes && !clientRes.writableEnded) {
    try {
      clientRes.write(`data: ${Math.min(100, Math.max(0, Math.round(pct)))}\n\n`);
    } catch {}
  }
}

function emitUploadDone(uploadId: string | null): void {
  if (!uploadId) return;
  const clientRes = uploadProgressClients.get(uploadId);
  if (clientRes && !clientRes.writableEnded) {
    try {
      clientRes.write(`event: done\ndata: 100\n\n`);
      clientRes.end();
    } catch {}
  }
  uploadProgressClients.delete(uploadId);
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(''));
    } catch {
      resolve('');
    }
  });
}

export const postsRouter = Router();
postsRouter.use(requireApproved);

// Expose active storage capabilities (max file size, dual-lane status) for upload validation
postsRouter.get('/storage-capabilities', (_req: AuthenticatedRequest, res) => {
  res.json(getStorageCapabilities());
});

// SSE endpoint streaming server -> Telegram upload progress (Phase 2: 30-100% on client)
postsRouter.get('/upload-progress/:uploadId', (req: AuthenticatedRequest, res) => {
  const uploadId = String(req.params.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!uploadId) {
    return res.status(400).json({ error: 'Invalid uploadId' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  uploadProgressClients.set(uploadId, res);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(':heartbeat\n\n');
      } catch {}
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    uploadProgressClients.delete(uploadId);
  });
});

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
    const uploadId = typeof req.query.uploadId === 'string' ? req.query.uploadId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : null;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const mainFile = files?.file?.[0];
    const thumbFile = files?.thumb?.[0];

    try {
      if (!mainFile) {
        return res.status(400).json({ error: 'No main file received' });
      }

      const caps = getStorageCapabilities();
      if (mainFile.size > caps.maxFileSizeBytes) {
        fs.unlink(mainFile.path, () => {});
        if (thumbFile) fs.unlink(thumbFile.path, () => {});
        return res.status(413).json({
          error: `File exceeds the active ${caps.maxFileSizeLabel} limit (${caps.mode}).`,
        });
      }

      const userId = req.user!.id;
      let mainStorageKey = `posts/${userId}/${mainFile.filename}`;
      let thumbStorageKey = thumbFile ? `posts/${userId}/${thumbFile.filename}` : mainStorageKey;

      // Compute SHA-256 checksum via stream (safe for multi-GB videos)
      const checksum = await computeFileSha256(mainFile.path);

      // Sync uploaded media to active cloud backend (Telegram Dual-Lane or Backblaze B2 / S3)
      const storage = getStorageAdapter();
      const isCloud = isCloudStorageBackend();

      if (isCloud && storage.putObject) {
        try {
          // For Telegram MTProto large files (>15 MB), pass disk path directly to avoid loading GBs into RAM
          const isLargeFile = mainFile.size > 15 * 1024 * 1024;
          const fileBuf = isLargeFile && caps.backend === 'telegram' ? Buffer.alloc(0) : fs.readFileSync(mainFile.path);

          const returnedMainKey = await storage.putObject(mainStorageKey, fileBuf, mainFile.mimetype, {
            filePath: mainFile.path,
            fileName: mainFile.originalname || mainFile.filename,
            fileSize: mainFile.size,
            onProgress: (pct) => emitUploadProgress(uploadId, pct),
          });
          if (typeof returnedMainKey === 'string' && returnedMainKey.length > 0) {
            mainStorageKey = returnedMainKey;
          }

          // Smart thumbnail handling: only upload real image thumbnails (never re-upload a whole video as its own thumb),
          // and skip redundant Telegram thumbnail upload for already-small photos (<250 KB)
          const thumbIsImage = Boolean(thumbFile && thumbFile.mimetype.startsWith('image/'));
          const shouldUploadThumb =
            thumbIsImage &&
            (caps.backend !== 'telegram' || mainFile.size >= 250 * 1024 || mainFile.mimetype.startsWith('video'));

          if (thumbFile && shouldUploadThumb) {
            const thumbBuf = fs.readFileSync(thumbFile.path);
            const returnedThumbKey = await storage.putObject(thumbStorageKey, thumbBuf, thumbFile.mimetype, {
              filePath: thumbFile.path,
              fileName: thumbFile.originalname || thumbFile.filename,
              fileSize: thumbFile.size,
            });
            if (typeof returnedThumbKey === 'string' && returnedThumbKey.length > 0) {
              thumbStorageKey = returnedThumbKey;
            }
          } else {
            thumbStorageKey = mainStorageKey;
          }

          // Clean up temporary multer files once safely stored in Telegram (small images are cached in tg-cache)
          if (isTelegramKey(mainStorageKey)) {
            fs.unlink(mainFile.path, () => {});
            if (thumbFile) fs.unlink(thumbFile.path, () => {});
          }
        } catch (cloudErr: any) {
          if (caps.backend === 'telegram') {
            fs.unlink(mainFile.path, () => {});
            if (thumbFile) fs.unlink(thumbFile.path, () => {});
            throw new Error(cloudErr?.message || 'Failed to upload file to Telegram storage');
          }
          console.error('⚠️ Cloud storage sync warning (file safely saved on disk):', cloudErr.message);
        }
      }

      emitUploadDone(uploadId);

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
        checksum,
      });
    } catch (err: any) {
      if (uploadId) uploadProgressClients.delete(uploadId);
      console.error('File upload error:', err);
      res.status(500).json({ error: err.message || 'File upload failed' });
    }
  }
);

// Generate signed upload URLs for browser direct upload
const handleSignedUploadUrls = async (req: AuthenticatedRequest, res: any) => {
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Files array required' });
  }

  const storage = getStorageAdapter();
  const userId = req.user!.id;
  const results: any[] = [];

  for (const f of files) {
    const ext = (f.fileName || f.filename || 'file').split('.').pop() || 'bin';
    const uuid = crypto.randomUUID();
    const mainStorageKey = `posts/${userId}/${Date.now()}_${uuid}.${ext}`;
    const thumbStorageKey = `posts/${userId}/${Date.now()}_${uuid}_thumb.jpg`;

    const mainUpload = await storage.getSignedUploadUrl(mainStorageKey, f.mimeType || f.contentType || 'application/octet-stream');
    const thumbUpload = await storage.getSignedUploadUrl(thumbStorageKey, f.thumbContentType || 'image/jpeg');

    results.push({
      fileName: f.fileName || f.filename,
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
};

postsRouter.post('/signed-upload-urls', handleSignedUploadUrls);
postsRouter.post('/presign-upload', handleSignedUploadUrls);

// Sync past uploads from cloud storage into feed
postsRouter.post('/sync-storage', async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await syncStorageToDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync storage' });
  }
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
      `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height, checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        f.checksum || null,
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

  // Share into user-selected groups (placements)
  const targetGroups = Array.isArray(groupIds) ? [...groupIds] : [];

  for (const gId of targetGroups) {
    // Verify user is in group or admin
    const member = queryOne('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', [gId, userId]);
    const grp = queryOne<any>('SELECT id, is_everyone FROM groups WHERE id = ?', [gId]);
    if (member || req.user!.role === 'admin' || grp?.is_everyone === 1) {
      const placementId = crypto.randomUUID();
      run(
        `INSERT OR IGNORE INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
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
      tgDeleted: Boolean(f.tg_deleted_at),
      tgDeletedAt: f.tg_deleted_at || null,
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

// Delete post: Protected in preview to preserve live memories; active on Render
postsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  if (isDeleteProtected()) {
    return res.status(403).json({
      error: 'Deletion is protected in this AI Studio preview to safeguard live memories. Delete is fully available on your Render deployment.',
    });
  }

  const postId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Only the author or an admin can delete this post' });
  }

  const permanent = req.query.permanent === 'true' || req.body?.permanent === true;
  if (permanent) {
    const files = queryAll<any>('SELECT * FROM post_files WHERE post_id = ?', [postId]);
    const storage = getStorageAdapter();
    for (const f of files) {
      try {
        await storage.deleteObject(f.storage_key);
        if (f.thumb_key && f.thumb_key !== f.storage_key) {
          await storage.deleteObject(f.thumb_key);
        }
      } catch {}
    }
    run("DELETE FROM item_groups WHERE item_type = 'post' AND item_id = ?", [postId]);
    run('DELETE FROM album_items WHERE post_id = ?', [postId]);
    run('DELETE FROM post_files WHERE post_id = ?', [postId]);
    run("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?", [postId]);
    run("DELETE FROM reactions WHERE target_type = 'post' AND target_id = ?", [postId]);
    run('DELETE FROM posts WHERE id = ?', [postId]);
  } else {
    run('UPDATE posts SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), postId]);
  }

  res.json({ success: true, message: permanent ? 'Post permanently deleted' : 'Moved to trash' });
});

// Update edited photo/file (crop/rotate)
postsRouter.put(
  '/:id/files/:fileId',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      const fileId = req.params.fileId;
      const userId = req.user!.id;
      const isAdmin = req.user!.role === 'admin';

      const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (!isAdmin && post.owner_id !== userId) {
        return res.status(403).json({ error: 'Only the author or an admin can edit photos in this post' });
      }

      const fileRecord = queryOne<any>('SELECT * FROM post_files WHERE id = ? AND post_id = ?', [fileId, postId]);
      if (!fileRecord) return res.status(404).json({ error: 'Photo not found in this post' });

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const mainFile = files?.file?.[0];
      const thumbFile = files?.thumb?.[0];

      if (!mainFile) {
        return res.status(400).json({ error: 'No edited photo received' });
      }

      let mainStorageKey = `posts/${userId}/${mainFile.filename}`;
      let thumbStorageKey = thumbFile ? `posts/${userId}/${thumbFile.filename}` : mainStorageKey;

      const storage = getStorageAdapter();
      const caps = getStorageCapabilities();
      if (isCloudStorageBackend() && storage.putObject) {
        try {
          const fileBuf = fs.readFileSync(mainFile.path);
          const returnedMainKey = await storage.putObject(mainStorageKey, fileBuf, mainFile.mimetype, {
            filePath: mainFile.path,
            fileName: mainFile.originalname || mainFile.filename,
            fileSize: mainFile.size,
          });
          if (typeof returnedMainKey === 'string' && returnedMainKey.length > 0) {
            mainStorageKey = returnedMainKey;
          }

          if (thumbFile && (caps.backend !== 'telegram' || mainFile.size >= 250 * 1024)) {
            const thumbBuf = fs.readFileSync(thumbFile.path);
            const returnedThumbKey = await storage.putObject(thumbStorageKey, thumbBuf, thumbFile.mimetype, {
              filePath: thumbFile.path,
              fileName: thumbFile.originalname || thumbFile.filename,
              fileSize: thumbFile.size,
            });
            if (typeof returnedThumbKey === 'string' && returnedThumbKey.length > 0) {
              thumbStorageKey = returnedThumbKey;
            }
          } else {
            thumbStorageKey = mainStorageKey;
          }

          if (isTelegramKey(mainStorageKey)) {
            fs.unlink(mainFile.path, () => {});
            if (thumbFile) fs.unlink(thumbFile.path, () => {});
          }
        } catch (cloudErr: any) {
          if (caps.backend === 'telegram') {
            fs.unlink(mainFile.path, () => {});
            if (thumbFile) fs.unlink(thumbFile.path, () => {});
            throw new Error(cloudErr?.message || 'Failed to upload edited photo to Telegram');
          }
          console.error('Cloud storage sync warning:', cloudErr.message);
        }
      }

      // Delete old file from storage adapter
      await storage.deleteObject(fileRecord.storage_key).catch(() => {});
      if (fileRecord.thumb_key && fileRecord.thumb_key !== fileRecord.storage_key) {
        await storage.deleteObject(fileRecord.thumb_key).catch(() => {});
      }

      const width = parseInt(req.body.width, 10) || 1200;
      const height = parseInt(req.body.height, 10) || 800;

      run(
        `UPDATE post_files
         SET storage_key = ?, thumb_key = ?, mime_type = ?, file_size = ?, width = ?, height = ?
         WHERE id = ? AND post_id = ?`,
        [mainStorageKey, thumbStorageKey, mainFile.mimetype, mainFile.size, width, height, fileId, postId]
      );

      const viewUrl = await storage.getSignedViewUrl(mainStorageKey, 86400);
      const thumbUrl = await storage.getSignedViewUrl(thumbStorageKey, 86400);

      res.json({
        success: true,
        updatedFile: {
          id: fileId,
          storageKey: mainStorageKey,
          thumbKey: thumbStorageKey,
          fileType: 'photo',
          mimeType: mainFile.mimetype,
          fileSize: mainFile.size,
          width,
          height,
          viewUrl,
          thumbUrl,
        },
      });
    } catch (err: any) {
      console.error('Photo update error:', err);
      res.status(500).json({ error: err.message || 'Failed to update photo' });
    }
  }
);

// Add more photos to an existing post / album
postsRouter.post('/:id/files', async (req: AuthenticatedRequest, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'Post/Album not found' });
    if (!isAdmin && post.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the author or an admin can add photos to this album' });
    }

    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    const maxPosRow = queryOne<{ maxPos: number }>(
      'SELECT COALESCE(MAX(position), -1) as maxPos FROM post_files WHERE post_id = ?',
      [postId]
    );
    let startPos = (maxPosRow?.maxPos ?? -1) + 1;

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
          startPos + i,
          f.thumbKey || f.storageKey,
          f.fileSize || 0,
          f.mimeType || 'image/jpeg',
          f.width || null,
          f.height || null,
        ]
      );
    }

    // Fetch all current files with fresh signed URLs
    const allFiles = queryAll<any>('SELECT * FROM post_files WHERE post_id = ? ORDER BY position ASC', [postId]);
    const storage = getStorageAdapter();
    const filesWithUrls = await Promise.all(
      allFiles.map(async (f) => ({
        id: f.id,
        storageKey: f.storage_key,
        thumbKey: f.thumb_key,
        fileType: f.file_type,
        fileSize: f.file_size,
        mimeType: f.mime_type,
        width: f.width,
        height: f.height,
        viewUrl: await storage.getSignedViewUrl(f.storage_key, 86400),
        thumbUrl: await storage.getSignedViewUrl(f.thumb_key || f.storage_key, 86400),
        tgDeleted: Boolean(f.tg_deleted_at),
        tgDeletedAt: f.tg_deleted_at || null,
      }))
    );

    res.json({
      success: true,
      files: filesWithUrls,
      message: `${files.length} photo(s) added to album`,
    });
  } catch (err: any) {
    console.error('Failed to add photos to post:', err);
    res.status(500).json({ error: err.message || 'Failed to add photos' });
  }
});

// Delete single photo/file from a multi-photo post: Protected in preview; active on Render
postsRouter.delete('/:id/files/:fileId', async (req: AuthenticatedRequest, res) => {
  if (isDeleteProtected()) {
    return res.status(403).json({
      error: 'Deletion is protected in this AI Studio preview to safeguard live memories. Delete is fully available on your Render deployment.',
    });
  }

  const postId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const fileRecord = queryOne<any>('SELECT * FROM post_files WHERE id = ? AND post_id = ?', [fileId, postId]);
  if (!fileRecord) return res.status(404).json({ error: 'Photo not found in this post' });

  const totalFiles = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM post_files WHERE post_id = ?', [postId]);
  if ((totalFiles?.count || 0) <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only photo from a post; delete the whole post instead' });
  }

  const storage = getStorageAdapter();
  try {
    await storage.deleteObject(fileRecord.storage_key);
    if (fileRecord.thumb_key && fileRecord.thumb_key !== fileRecord.storage_key) {
      await storage.deleteObject(fileRecord.thumb_key);
    }
  } catch {}

  run('DELETE FROM post_files WHERE id = ?', [fileId]);
  res.json({ success: true, message: 'Photo deleted' });
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

// Update post caption explicitly (when user chooses to apply a caption or suggestion)
postsRouter.post('/:id/caption', async (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const { caption } = req.body;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Permission denied to edit caption' });
  }

  run('UPDATE posts SET caption = ? WHERE id = ?', [caption || null, postId]);
  res.json({ success: true, caption });
});

// Convert a post (or multi-photo album post) into an Event collection
postsRouter.post('/:id/convert-to-event', async (req: AuthenticatedRequest, res) => {
  const postId = req.params.id;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const { title, eventDate, eventPlace, description } = req.body;

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Only the author or an admin can convert this memory' });
  }

  const now = new Date().toISOString();
  const albumId = crypto.randomUUID();
  const albumTitle = title?.trim() || post.caption?.trim() || 'Event Memory';
  const dateToUse = eventDate || (post.taken_at ? post.taken_at.slice(0, 10) : now.slice(0, 10));
  const placeToUse = eventPlace ? eventPlace.trim() : null;

  // Create album as an event
  run(
    `INSERT INTO albums (id, title, description, creator_id, is_event, event_date, event_place, status, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, 'approved', ?)`,
    [albumId, albumTitle, description?.trim() || post.caption || null, userId, dateToUse, placeToUse, now]
  );

  // Link post into album_items
  run(
    `INSERT INTO album_items (album_id, post_id, position, added_at)
     VALUES (?, ?, 0, ?)`,
    [albumId, postId, now]
  );

  // Copy placements from item_groups
  const postPlacements = queryAll<any>("SELECT group_id FROM item_groups WHERE item_type = 'post' AND item_id = ?", [postId]);
  for (const pl of postPlacements) {
    const plId = crypto.randomUUID();
    run(
      `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
       VALUES (?, 'album', ?, ?, ?, 0, 'approved', ?)`,
      [plId, albumId, pl.group_id, userId, now]
    );
  }

  // Also auto-attend creator (event_attendance schema: event_id, user_id, tagged_by, created_at)
  run(
    `INSERT OR IGNORE INTO event_attendance (event_id, user_id, tagged_by, created_at)
     VALUES (?, ?, NULL, ?)`,
    [albumId, userId, now]
  );

  res.status(201).json({
    success: true,
    message: 'Memory converted to Event successfully',
    albumId,
    title: albumTitle,
    eventDate: dateToUse,
    eventPlace: placeToUse,
  });
});

// Check if files to be uploaded are duplicates of existing photos
postsRouter.post('/check-duplicates', async (req: AuthenticatedRequest, res) => {
  const { files } = req.body;
  const userId = req.user!.id;

  if (!Array.isArray(files) || files.length === 0) {
    return res.json({ duplicates: [] });
  }

  const duplicates: any[] = [];
  const storage = getStorageAdapter();

  for (const f of files) {
    let match: any = null;

    if (f.checksum) {
      match = queryOne<any>(
        `SELECT pf.*, p.caption, p.taken_at, p.id as post_id, p.owner_id
         FROM post_files pf
         JOIN posts p ON pf.post_id = p.id
         WHERE pf.checksum = ? AND p.deleted_at IS NULL
         LIMIT 1`,
        [f.checksum]
      );
    }

    if (!match && f.size && f.size > 0) {
      match = queryOne<any>(
        `SELECT pf.*, p.caption, p.taken_at, p.id as post_id, p.owner_id
         FROM post_files pf
         JOIN posts p ON pf.post_id = p.id
         WHERE pf.file_size = ? AND p.deleted_at IS NULL
         LIMIT 1`,
        [f.size]
      );
    }

    if (match) {
      duplicates.push({
        fileName: f.name || f.fileName,
        fileSize: f.size,
        checksum: f.checksum,
        existingPostId: match.post_id,
        existingCaption: match.caption,
        existingTakenAt: match.taken_at,
        existingThumbUrl: await storage.getSignedViewUrl(match.thumb_key || match.storage_key),
        isOwnMemory: match.owner_id === userId,
      });
    }
  }

  res.json({ duplicates });
});

// List duplicate photos across library
postsRouter.get('/duplicates/list', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const storage = getStorageAdapter();

  // Retrieve match_keys user explicitly chose to keep both
  const ignoredRows = queryAll<{ match_key: string }>(
    'SELECT match_key FROM ignored_duplicates WHERE user_id = ?',
    [userId]
  );
  const ignoredSet = new Set(ignoredRows.map((r) => r.match_key));

  // Find all file_sizes or checksums that have 2+ photos in active posts
  const duplicateSets = queryAll<any>(
    `SELECT file_size, width, height, COUNT(*) as count
     FROM post_files pf
     JOIN posts p ON pf.post_id = p.id
     WHERE p.deleted_at IS NULL AND pf.file_size > 0
     ${isAdmin ? '' : 'AND p.owner_id = ?'}
     GROUP BY file_size, width, height
     HAVING COUNT(*) > 1
     ORDER BY count DESC, file_size DESC`,
    isAdmin ? [] : [userId]
  );

  const duplicateGroups: any[] = [];

  for (const set of duplicateSets) {
    const matchKey = `${set.file_size}_${set.width}_${set.height}`;
    if (ignoredSet.has(matchKey)) {
      continue;
    }

    const rawFiles = queryAll<any>(
      `SELECT pf.id as file_id, pf.post_id, pf.storage_key, pf.thumb_key, pf.file_size,
              pf.width, pf.height, pf.checksum, pf.position, pf.tg_deleted_at,
              p.caption, p.taken_at, p.uploaded_at, p.owner_id,
              u.username as owner_username, u.display_name as owner_display_name
       FROM post_files pf
       JOIN posts p ON pf.post_id = p.id
       JOIN users u ON p.owner_id = u.id
       WHERE pf.file_size = ? AND (pf.width = ? OR (pf.width IS NULL AND ? IS NULL)) AND (pf.height = ? OR (pf.height IS NULL AND ? IS NULL)) AND p.deleted_at IS NULL
       ${isAdmin ? '' : 'AND p.owner_id = ?'}
       ORDER BY p.taken_at ASC`,
      isAdmin ? [set.file_size, set.width, set.width, set.height, set.height] : [set.file_size, set.width, set.width, set.height, set.height, userId]
    );

    if (rawFiles.length > 1) {
      const filesWithUrls = await Promise.all(
        rawFiles.map(async (rf) => {
          const placements = queryAll<any>(
            `SELECT g.id, g.name FROM item_groups ig JOIN groups g ON ig.group_id = g.id WHERE ig.item_type = 'post' AND ig.item_id = ?`,
            [rf.post_id]
          );

          return {
            fileId: rf.file_id,
            postId: rf.post_id,
            caption: rf.caption,
            takenAt: rf.taken_at,
            uploadedAt: rf.uploaded_at,
            fileSize: rf.file_size,
            width: rf.width,
            height: rf.height,
            isOwner: rf.owner_id === userId,
            ownerName: rf.owner_display_name,
            viewUrl: await storage.getSignedViewUrl(rf.storage_key),
            thumbUrl: await storage.getSignedViewUrl(rf.thumb_key || rf.storage_key),
            tgDeleted: Boolean(rf.tg_deleted_at),
            placements: placements.map((p) => ({ id: p.id, name: p.name })),
          };
        })
      );

      duplicateGroups.push({
        matchKey,
        fileSize: set.file_size,
        fileCount: rawFiles.length,
        wastedBytes: (rawFiles.length - 1) * set.file_size,
        files: filesWithUrls,
      });
    }
  }

  res.json({ duplicateGroups });
});

// Option to keep both/all images in duplicate finder (dismisses the duplicate alert)
postsRouter.post('/duplicates/keep-both', async (req: AuthenticatedRequest, res) => {
  const { matchKey } = req.body;
  const userId = req.user!.id;

  if (!matchKey) {
    return res.status(400).json({ error: 'matchKey is required' });
  }

  const now = new Date().toISOString();
  try {
    run(
      `INSERT OR IGNORE INTO ignored_duplicates (id, user_id, match_key, created_at)
       VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), userId, matchKey, now]
    );
  } catch (e) {}

  res.json({
    success: true,
    message: 'Both images kept in your memory vault',
    matchKey,
  });
});

// Resolve duplicate photos: Protected in preview; active on Render
postsRouter.post('/duplicates/resolve', async (req: AuthenticatedRequest, res) => {
  if (isDeleteProtected()) {
    return res.status(403).json({
      error: 'Deletion is protected in this AI Studio preview to safeguard live memories. Delete is fully available on your Render deployment.',
    });
  }

  const { fileId, postId } = req.body;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isAdmin && post.owner_id !== userId) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const fileRecord = queryOne<any>('SELECT * FROM post_files WHERE id = ? AND post_id = ?', [fileId, postId]);
  if (!fileRecord) return res.status(404).json({ error: 'Photo not found' });

  const totalFiles = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM post_files WHERE post_id = ?', [postId]);
  const storage = getStorageAdapter();

  try {
    await storage.deleteObject(fileRecord.storage_key);
    if (fileRecord.thumb_key && fileRecord.thumb_key !== fileRecord.storage_key) {
      await storage.deleteObject(fileRecord.thumb_key);
    }
  } catch {}

  if ((totalFiles?.count || 0) <= 1) {
    run("DELETE FROM item_groups WHERE item_type = 'post' AND item_id = ?", [postId]);
    run('DELETE FROM album_items WHERE post_id = ?', [postId]);
    run('DELETE FROM post_files WHERE post_id = ?', [postId]);
    run('DELETE FROM posts WHERE id = ?', [postId]);
  } else {
    run('DELETE FROM post_files WHERE id = ?', [fileId]);
  }

  res.json({ success: true, message: 'Duplicate photo resolved' });
});

