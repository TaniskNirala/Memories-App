import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, run, queryOne, saveDb } from './db.ts';

export async function seedDatabase(force: boolean = false): Promise<void> {
  await getDb();

  const userCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!force && (userCount?.count || 0) > 0) {
    return; // Already initialized
  }

  console.log('Initializing clean database for Tanisk...');

  // Clear all existing demo data
  run('DELETE FROM audit_log');
  run('DELETE FROM reports');
  run('DELETE FROM notifications');
  run('DELETE FROM mentions');
  run('DELETE FROM reactions');
  run('DELETE FROM comments');
  run('DELETE FROM event_notes');
  run('DELETE FROM event_attendance');
  run('DELETE FROM item_groups');
  run('DELETE FROM album_items');
  run('DELETE FROM albums');
  run('DELETE FROM post_files');
  run('DELETE FROM posts');
  run('DELETE FROM group_members');
  run('DELETE FROM groups');
  run('DELETE FROM login_attempts');
  run('DELETE FROM password_resets');
  run('DELETE FROM sessions');
  run('DELETE FROM users');

  // Admin user: tanisk / pwd: admin
  const adminHash = await bcrypt.hash('admin', 10);
  const taniskId = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO users (id, username, password_hash, display_name, role, status, avatar_color, created_at)
     VALUES (?, 'tanisk', ?, 'Tanisk', 'admin', 'active', '#f59e0b', ?)`,
    [taniskId, adminHash, now]
  );

  // Default "Everyone" group for family
  const everyoneId = crypto.randomUUID();
  run(
    `INSERT INTO groups (id, name, description, creator_id, is_everyone, created_at)
     VALUES (?, 'Everyone', 'Family circle containing all approved members', ?, 1, ?)`,
    [everyoneId, taniskId, now]
  );

  run(
    `INSERT INTO group_members (group_id, user_id, joined_at)
     VALUES (?, ?, ?)`,
    [everyoneId, taniskId, now]
  );

  await saveDb();
  console.log('✅ Clean database ready! Admin user "tanisk" (pwd: "admin") created.');
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
