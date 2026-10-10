import Database from 'libsql';
import fs from 'fs';
import path from 'path';

let dbInstance: any = null;
let isTursoSynced = false;

function getDbFilePath(): string {
  const dir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  return process.env.DB_PATH || path.join(dir, 'kinfolk.sqlite');
}

export async function getDb(): Promise<any> {
  if (dbInstance) return dbInstance;

  const dbFile = getDbFilePath();
  const targetDir = path.dirname(dbFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (tursoUrl && tursoToken) {
    console.log(`🔌 Connecting to Turso Database at ${tursoUrl}...`);
    try {
      dbInstance = new (Database as any)(dbFile, {
        syncUrl: tursoUrl,
        authToken: tursoToken,
        readYourWrites: true,
      });
      isTursoSynced = true;
      try {
        dbInstance.sync();
        console.log('✅ Successfully connected and synced with Turso cloud!');
      } catch (syncErr: any) {
        console.warn('⚠️ Initial Turso sync notice:', syncErr.message || syncErr);
      }
    } catch (err: any) {
      console.error('❌ Failed to connect to Turso with syncUrl, falling back to local SQLite:', err.message || err);
      dbInstance = new Database(dbFile);
      isTursoSynced = false;
    }
  } else {
    console.log(`📂 Using local SQLite database at ${dbFile}`);
    dbInstance = new Database(dbFile);
    isTursoSynced = false;
  }

  initSchema(dbInstance);
  return dbInstance;
}

export function saveDb(): void {
  if (dbInstance && isTursoSynced) {
    try {
      dbInstance.sync();
    } catch {
      // Periodic sync will catch up
    }
  }
}

function cleanRow<T = any>(row: any): T {
  if (!row || typeof row !== 'object') return row;
  if ('_metadata' in row) {
    const { _metadata, ...clean } = row;
    return clean as T;
  }
  return row as T;
}

export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
  return rows.map((r: any) => cleanRow<T>(r));
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  const row = params.length > 0 ? stmt.get(...params) : stmt.get();
  return row ? cleanRow<T>(row) : null;
}

export function run(sql: string, params: any[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  if (params.length > 0) {
    stmt.run(...params);
  } else {
    stmt.run();
  }
  saveDb();
}

function initSchema(db: any) {
  db.exec(`
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
    db.exec('ALTER TABLE post_files ADD COLUMN checksum TEXT');
  } catch {}
}
