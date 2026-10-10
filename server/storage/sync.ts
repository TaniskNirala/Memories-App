import { getStorageAdapter } from './index.ts';
import { queryOne, run } from '../db.ts';
import crypto from 'crypto';

/**
 * Scans storage (Backblaze B2 / S3 / local) for any past uploaded files
 * that are missing from the database (e.g. after a server migration, db wipe, or restart)
 * and restores them into the posts and feed.
 */
export async function syncStorageToDatabase(): Promise<{ recovered: number; totalFound: number }> {
  try {
    const storage = getStorageAdapter();
    if (!storage.listObjects) {
      return { recovered: 0, totalFound: 0 };
    }

    // List all objects across storage root and posts prefix
    let allKeys: string[] = [];
    try {
      allKeys = await storage.listObjects('');
    } catch (e: any) {
      console.warn('Listing root objects failed, trying posts prefix:', e?.message);
    }
    if (!allKeys || allKeys.length === 0) {
      try {
        allKeys = await storage.listObjects('posts');
      } catch {}
    }

    if (!allKeys || allKeys.length === 0) {
      return { recovered: 0, totalFound: 0 };
    }

    // Filter out thumbnails and non-media files
    const mediaKeys = allKeys.filter((k) => {
      const lower = k.toLowerCase();
      if (lower.includes('_thumb.') || lower.endsWith('.thumb')) return false;
      return /\.(jpe?g|png|webp|gif|mp4|mov|webm|mp3|m4a)$/i.test(lower);
    });

    // Get primary admin or first active user
    let owner = queryOne<any>("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1");
    if (!owner) {
      owner = queryOne<any>("SELECT id FROM users WHERE status = 'active' ORDER BY created_at ASC LIMIT 1");
    }
    if (!owner) {
      owner = queryOne<any>('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    }
    if (!owner) {
      return { recovered: 0, totalFound: mediaKeys.length };
    }

    // Get everyone group
    const everyoneGroup = queryOne<any>('SELECT id FROM groups WHERE is_everyone = 1 LIMIT 1');

    let recoveredCount = 0;
    const now = new Date().toISOString();

    for (const key of mediaKeys) {
      // Check if this file already exists in post_files
      const existing = queryOne('SELECT id FROM post_files WHERE storage_key = ?', [key]);
      if (existing) continue;

      // Extract user ID from path if available: posts/<userId>/...
      const parts = key.split('/');
      let targetUserId = owner.id;
      if (parts.length >= 3) {
        const userMatch = queryOne('SELECT id FROM users WHERE id = ?', [parts[1]]);
        if (userMatch) {
          targetUserId = userMatch.id;
        }
      }

      const postId = crypto.randomUUID();
      const fileId = crypto.randomUUID();

      // Check if a thumbnail exists
      const lastDot = key.lastIndexOf('.');
      const baseWithoutExt = lastDot > -1 ? key.substring(0, lastDot) : key;
      const thumbCandidate = `${baseWithoutExt}_thumb.jpg`;
      const hasThumb = allKeys.includes(thumbCandidate);
      const thumbKey = hasThumb ? thumbCandidate : key;

      const isVideo = /\.(mp4|mov|webm|avi)$/i.test(key);
      const fileType = isVideo ? 'video' : 'photo';

      run(
        `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, deleted_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'uploaded_at', 1, NULL, ?)`,
        [postId, targetUserId, null, now, now, now]
      );

      run(
        `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
         VALUES (?, ?, ?, ?, 0, ?, 0, ?, 1200, 800)`,
        [fileId, postId, key, fileType, thumbKey, isVideo ? 'video/mp4' : 'image/jpeg']
      );

      if (everyoneGroup) {
        const itemGroupId = crypto.randomUUID();
        run(
          `INSERT INTO item_groups (id, item_type, item_id, group_id, added_by, is_reference, reference_status, added_at)
           VALUES (?, 'post', ?, ?, ?, 0, 'approved', ?)`,
          [itemGroupId, postId, everyoneGroup.id, targetUserId, now]
        );
      }

      recoveredCount++;
    }

    if (recoveredCount > 0) {
      console.log(`✅ [Storage Recovery] Successfully restored ${recoveredCount} photos from storage into feed!`);
    }

    return { recovered: recoveredCount, totalFound: mediaKeys.length };
  } catch (err: any) {
    console.error('⚠️ [Storage Recovery Error]:', err.message || err);
    return { recovered: 0, totalFound: 0 };
  }
}
