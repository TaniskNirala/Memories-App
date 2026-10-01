import { createClient } from '@libsql/client';
import { getDb, queryAll } from '../server/db.ts';
import { seedDatabase } from '../server/seed.ts';
import dotenv from 'dotenv';

dotenv.config();

async function pushToTurso() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('❌ Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  console.log(`🔌 Connecting to Turso database: ${url}...`);
  const client = createClient({ url, authToken });

  // Test connection
  try {
    await client.execute('SELECT 1');
    console.log('✅ Connected to Turso successfully!');
  } catch (err: any) {
    console.error('❌ Failed to connect to Turso:', err.message);
    process.exit(1);
  }

  // Ensure local DB is initialized with clean Tanisk admin user
  await getDb();
  await seedDatabase(true);

  const tables = [
    'users',
    'sessions',
    'password_resets',
    'login_attempts',
    'groups',
    'group_members',
    'posts',
    'post_files',
    'albums',
    'album_items',
    'item_groups',
    'event_attendance',
    'event_notes',
    'comments',
    'reactions',
    'mentions',
    'notifications',
    'reports',
    'audit_log',
  ];

  console.log('🔨 Dropping previous incomplete tables on Turso if any...');
  for (const table of [...tables].reverse()) {
    try {
      await client.execute(`DROP TABLE IF EXISTS ${table}`);
    } catch {}
  }

  console.log('🔨 Creating schema on Turso matching server/db.ts...');
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'active',
      avatar_color TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      is_everyone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      caption TEXT,
      taken_at TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      date_basis TEXT NOT NULL DEFAULT 'taken_at',
      is_standalone INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      visibility_override TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS post_files (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'photo',
      position INTEGER NOT NULL DEFAULT 0,
      thumb_key TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      is_event INTEGER NOT NULL DEFAULT 0,
      event_date TEXT,
      event_place TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      proposal_notes TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS album_items (
      album_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      PRIMARY KEY (album_id, post_id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_groups (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      is_reference INTEGER NOT NULL DEFAULT 0,
      reference_status TEXT NOT NULL DEFAULT 'approved',
      added_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS event_attendance (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tagged_by TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS event_notes (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'group',
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      parent_id TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mentions (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      mentioned_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    )`,
  ];

  for (const sql of schemaStatements) {
    await client.execute(sql);
  }
  console.log('✅ Schema created successfully on Turso!');

  // 2. Transfer rows
  for (const table of tables) {
    const rows = queryAll(`SELECT * FROM ${table}`);
    if (rows.length === 0) continue;

    console.log(`📤 Syncing ${rows.length} rows to ${table}...`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
      const args = keys.map((k) => row[k]);
      await client.execute({ sql, args });
    }
  }

  console.log('🎉 All tables and data pushed to Turso successfully!');
  console.log('Your Turso cloud database is ready for production!');
}

pushToTurso().catch((e) => {
  console.error('Fatal error during Turso push:', e);
  process.exit(1);
});
