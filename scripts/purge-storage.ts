import dotenv from 'dotenv';
dotenv.config();

import { getStorageAdapter } from '../server/storage/index.ts';
import { getDb, run } from '../server/db.ts';

async function purgeEverything() {
  console.log('🚨 Starting Complete Storage & Database Purge...');
  
  await getDb();
  const storage = getStorageAdapter();

  let deletedCount = 0;
  if (storage.purgeAllObjects) {
    console.log('🗑️  Scanning and deleting all objects from storage...');
    const res = await storage.purgeAllObjects();
    deletedCount = res.deleted;
    console.log(`✅ Deleted ${deletedCount} objects from storage bucket/disk.`);
  }

  console.log('🧹 Purging all media records, comments, and posts from database...');
  run('PRAGMA foreign_keys = OFF');
  run('DELETE FROM comments');
  run('DELETE FROM reactions');
  run('DELETE FROM post_files');
  run('DELETE FROM album_items');
  run('DELETE FROM event_attendance');
  run('DELETE FROM event_notes');
  run("DELETE FROM item_groups WHERE item_type IN ('post', 'album')");
  run('DELETE FROM posts');
  run('DELETE FROM albums');
  run('PRAGMA foreign_keys = ON');

  console.log('✨ All past data purged successfully! Database and bucket are completely clean.');
  process.exit(0);
}

purgeEverything().catch((err) => {
  console.error('❌ Error during purge:', err);
  process.exit(1);
});
