import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb, run, queryOne, queryAll, saveDb } from './db.ts';

export const TANISK_ID = 'f2bc3e7f-d7a1-4a8b-b789-282c9c8eb4a3';
export const EVERYONE_GROUP_ID = '56896808-0e5c-4303-b413-98b0eb3ad540';

export async function syncUploadedPhotosToDatabase(): Promise<void> {
  const uploadsDir = path.resolve(process.cwd(), 'uploads/posts');
  if (!fs.existsSync(uploadsDir)) return;

  const userDirs = fs.readdirSync(uploadsDir);
  const now = new Date().toISOString();

  // Find or verify Everyone group
  const everyoneGroup = queryOne<any>('SELECT id FROM groups WHERE is_everyone = 1') ||
    queryOne<any>('SELECT id FROM groups WHERE id = ?', [EVERYONE_GROUP_ID]);
  const groupId = everyoneGroup?.id || EVERYONE_GROUP_ID;

  for (const userId of userDirs) {
    const userPath = path.join(uploadsDir, userId);
    if (!fs.statSync(userPath).isDirectory()) continue;

    const files = fs.readdirSync(userPath);
    // Find all primary photo files (exclude thumbnails and 0-byte or corrupted files)
    const mainFiles = files.filter((f) => !f.endsWith('_thumb.jpg') && !f.startsWith('.'));

    for (const fileName of mainFiles) {
      const fullPath = path.join(userPath, fileName);
      const stat = fs.statSync(fullPath);
      // Skip tiny files (< 1KB) as corrupted/test
      if (stat.size < 1000) continue;

      const storageKey = `posts/${userId}/${fileName}`;
      const thumbFile = fileName.replace(/\.([^.]+)$/, '_thumb.$1');
      const thumbExists = fs.existsSync(path.join(userPath, thumbFile));
      const thumbKey = thumbExists ? `posts/${userId}/${thumbFile}` : storageKey;

      // Check if file is already in post_files
      const existingFile = queryOne<any>('SELECT id, post_id FROM post_files WHERE storage_key = ?', [storageKey]);
      if (existingFile) {
        continue;
      }

      // Parse timestamp from filename (e.g. 1790883205230_xxx.jpg)
      let takenAt = now;
      const tsMatch = fileName.match(/^(\d{10,13})/);
      if (tsMatch) {
        const ms = parseInt(tsMatch[1], 10);
        if (!isNaN(ms) && ms > 0) {
          takenAt = new Date(ms).toISOString();
        }
      }

      const postId = crypto.randomUUID();
      const fileId = crypto.randomUUID();

      run(
        `INSERT INTO posts (id, owner_id, caption, taken_at, uploaded_at, date_basis, is_standalone, deleted_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'taken_at', 1, NULL, ?)`,
        [postId, userId, 'Family Memory', takenAt, takenAt, now]
      );

      run(
        `INSERT INTO post_files (id, post_id, storage_key, file_type, position, thumb_key, file_size, mime_type, width, height)
         VALUES (?, ?, ?, 'photo', 0, ?, ?, 'image/jpeg', 1200, 800)`,
        [fileId, postId, storageKey, thumbKey, stat.size]
      );

      // Note: Recovered photos remain personal/standalone by default so nothing is automatically forced into Everyone
      console.log(`📸 Recovered uploaded photo into personal library: ${storageKey}`);
    }
  }

  saveDb();
}

export async function seedDatabase(force: boolean = false): Promise<void> {
  await getDb();

  const userCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  const now = new Date().toISOString();

  // If database already has users and not force, just ensure uploaded photos are synced
  if (!force && (userCount?.count || 0) > 0) {
    await syncUploadedPhotosToDatabase();
    return;
  }

  console.log('Initializing clean database for Tanisk...');

  // Ensure Admin user: tanisk
  const existingTanisk = queryOne<any>('SELECT id FROM users WHERE username = "tanisk"');
  if (!existingTanisk) {
    const adminHash = await bcrypt.hash('admin', 10);
    run(
      `INSERT OR REPLACE INTO users (id, username, password_hash, display_name, role, status, avatar_color, created_at)
       VALUES (?, 'tanisk', ?, 'Tanisk', 'admin', 'active', '#f59e0b', ?)`,
      [TANISK_ID, adminHash, now]
    );
  }

  // Ensure Default "Everyone" group for family
  const existingGroup = queryOne<any>('SELECT id FROM groups WHERE id = ? OR is_everyone = 1', [EVERYONE_GROUP_ID]);
  if (!existingGroup) {
    run(
      `INSERT OR REPLACE INTO groups (id, name, description, creator_id, is_everyone, created_at)
       VALUES (?, 'Everyone', 'Family circle containing all approved members', ?, 1, ?)`,
      [EVERYONE_GROUP_ID, TANISK_ID, now]
    );
  }

  // Ensure Tanisk is member of Everyone group
  const isMember = queryOne<any>(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
    [EVERYONE_GROUP_ID, TANISK_ID]
  );
  if (!isMember) {
    run(
      `INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at)
       VALUES (?, ?, ?)`,
      [EVERYONE_GROUP_ID, TANISK_ID, now]
    );
  }

  // Sync all real uploaded user photos from disk into posts
  await syncUploadedPhotosToDatabase();

  await saveDb();
  console.log('✅ Clean database ready! Real photos synced.');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase(true).then(() => {
    console.log('Done!');
    process.exit(0);
  }).catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

