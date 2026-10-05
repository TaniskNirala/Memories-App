import initSqlJs, { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { createClient, type Client } from '@libsql/client';

let dbInstance: Database | null = null;
let tursoClient: Client | null = null;
const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'kinfolk.sqlite');

const TURSO_TABLES = [
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

export function getTursoClient(): Client | null {
  if (tursoClient) return tursoClient;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url && authToken) {
    tursoClient = createClient({ url, authToken });
  }
  return tursoClient;
}

export async function syncToTurso(sql: string, params: SqlValue[] = []): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  try {
    await client.execute({ sql, args: params as any });
  } catch (err: any) {
    console.error('Turso cloud sync warning:', err.message);
  }
}

async function pullFromTurso(db: Database): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  try {
    console.log('🔄 Checking Turso cloud database for existing records...');
    const check = await client.execute('SELECT count(*) as count FROM users');
    const count = Number(check.rows[0]?.count || 0);
    if (count > 0) {
      console.log(`📥 Restoring from Turso cloud (${count} users found)...`);
      for (const table of TURSO_TABLES) {
        try {
          const res = await client.execute(`SELECT * FROM ${table}`);
          if (res.rows && res.rows.length > 0) {
            db.run(`DELETE FROM ${table}`);
            for (const row of res.rows) {
              const keys = Object.keys(row);
              const placeholders = keys.map(() => '?').join(', ');
              const values = keys.map((k) => row[k]);
              db.run(`INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values as SqlValue[]);
            }
          }
        } catch {
          // Table might be empty or uncreated yet
        }
      }
      console.log('✅ Local cache fully synced from Turso cloud database!');
    }
  } catch (err: any) {
    console.log('Turso cloud sync status:', err.message);
  }
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await (initSqlJs as unknown as () => Promise<any>)();

  let currentDb: Database;
  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      currentDb = new SQL.Database(fileBuffer);
    } catch (e) {
      console.error('Failed to read existing DB file, creating fresh one', e);
      currentDb = new SQL.Database();
    }
  } else {
    currentDb = new SQL.Database();
  }

  dbInstance = currentDb;
  initSchema(currentDb);

  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    await pullFromTurso(currentDb);
  }

  saveDb();
  return currentDb;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Failed to persist SQLite DB to disk:', err);
  }
}

export function queryAll<T = any>(sql: string, params: SqlValue[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = any>(sql: string, params: SqlValue[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function run(sql: string, params: SqlValue[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  saveDb();
  syncToTurso(sql, params);
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pending', -- 'admin', 'member', 'pending'
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended'
      avatar_color TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      is_everyone INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      caption TEXT,
      taken_at TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      date_basis TEXT NOT NULL DEFAULT 'taken_at',
      is_standalone INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      visibility_override TEXT, -- 'public_all', 'hidden' or NULL
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS post_files (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'photo', -- 'photo', 'video', 'audio'
      position INTEGER NOT NULL DEFAULT 0,
      thumb_key TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      checksum TEXT,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      is_event INTEGER NOT NULL DEFAULT 0,
      event_date TEXT,
      event_place TEXT,
      status TEXT NOT NULL DEFAULT 'approved', -- 'pending_approval', 'approved', 'rejected'
      proposal_notes TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS album_items (
      album_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      PRIMARY KEY (album_id, post_id),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_groups (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL, -- 'post' or 'album'
      item_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      is_reference INTEGER NOT NULL DEFAULT 0,
      reference_status TEXT NOT NULL DEFAULT 'approved', -- 'pending_owner_approval', 'approved', 'rejected'
      added_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (added_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS event_attendance (
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tagged_by TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_notes (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'group', -- 'group', 'all'
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL, -- 'post' or 'album'
      target_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      parent_id TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL, -- 'post', 'album', 'comment'
      target_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      mentioned_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (mentioned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (reporter_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ignored_duplicates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      match_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, match_key)
    );
  `);

  try {
    db.run('ALTER TABLE post_files ADD COLUMN checksum TEXT');
  } catch {}
}
