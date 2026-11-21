import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import {
  isNeonConfigured,
  getMaskedNeonTarget,
  connectNeon,
  countNeonRows,
  restoreAllFromNeon,
  pushAllLocalToNeon,
  pushWriteToNeon,
  flushNeonWrites,
  shouldForwardToNeon,
  getWriteStats,
} from './neon.ts';

/**
 * Database architecture
 * ---------------------
 *  - Neon PostgreSQL (DATABASE_URL) is the durable source of truth.
 *  - A local SQLite file/cache serves fast synchronous reads for the whole app.
 *  - Every INSERT / UPDATE / DELETE goes to the local cache AND is queued, in order, to Neon.
 *  - On every boot the Neon tables are created automatically and the cache is rebuilt from Neon,
 *    so a restart, redeploy or a login from a new device always sees the same data.
 *  - Without DATABASE_URL the app runs on local SQLite only (development).
 */

let dbInstance: any = null;
let initPromise: Promise<any> | null = null;
let isCloudSynced = false;
let lastSyncTimestamp: string | null = null;
let cloudSyncError: string | null = null;

function getDbFilePath(): string {
  const dir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  return process.env.DB_PATH || path.join(dir, 'kinfolk.sqlite');
}

function localCount(db: any, table: string): number {
  try {
    return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()?.count || 0;
  } catch {
    return 0;
  }
}

async function initDb(): Promise<any> {
  const dbFile = getDbFilePath();
  const targetDir = path.dirname(dbFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const local = new Database(dbFile);
  initSchema(local);

  if (isNeonConfigured()) {
    console.log(`🔌 [Neon] Connecting to ${getMaskedNeonTarget()} ...`);
    // Throws (and stops the boot) if Neon is unreachable: starting with an empty cache would
    // look like data loss, and we must never write over Neon from a stale/empty copy.
    await connectNeon();

    const neonUsers = await countNeonRows('users');
    const localUsers = localCount(local, 'users');

    if (neonUsers === 0 && localUsers > 0) {
      // First ever boot on Neon: migrate whatever the local database file already contains.
      console.log(`🚚 [Neon] Neon is empty - migrating ${localUsers} existing local user(s) and their data into Neon...`);
      const pushed = await pushAllLocalToNeon(local);
      if (!pushed.success) throw new Error(`Initial migration to Neon failed: ${pushed.error}`);
    } else {
      const restored = await restoreAllFromNeon(local, { clearLocalFirst: true });
      if (!restored.success) throw new Error(`Restore from Neon failed: ${restored.error}`);
    }

    isCloudSynced = true;
    lastSyncTimestamp = new Date().toISOString();
    cloudSyncError = null;
  } else {
    console.warn(
      '⚠️  [DB] DATABASE_URL is not set - using LOCAL SQLite only. Data will be LOST when the server restarts on ephemeral hosting (Render). Set DATABASE_URL to your Neon connection string.'
    );
  }

  try {
    local.exec('PRAGMA foreign_keys = ON;');
  } catch {}

  dbInstance = local;
  return local;
}

export async function getDb(): Promise<any> {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = initDb().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function saveDb(): void {
  // Local writes are persistent via SQLite; durable copy is mirrored to Neon by run().
}

export function getDatabaseStatus(): {
  isTursoSynced: boolean;
  tursoConfigured: boolean;
  lastSync: string | null;
  error: string | null;
  tursoUrl: string | null;
  userCount: number;
  postCount: number;
  albumCount: number;
  provider: 'neon' | 'sqlite';
  pendingWrites: number;
  failedWrites: number;
  lastWriteOkAt: string | null;
} {
  const stats = getWriteStats();
  return {
    // (field names kept for the existing admin UI; they now describe Neon)
    isTursoSynced: isCloudSynced && stats.failedWrites === 0,
    tursoConfigured: isNeonConfigured(),
    lastSync: lastSyncTimestamp,
    error: cloudSyncError || stats.lastWriteError,
    tursoUrl: getMaskedNeonTarget(),
    userCount: dbInstance ? localCount(dbInstance, 'users') : 0,
    postCount: dbInstance
      ? (dbInstance.prepare('SELECT COUNT(*) as count FROM posts WHERE deleted_at IS NULL').get()?.count || 0)
      : 0,
    albumCount: dbInstance
      ? (dbInstance.prepare('SELECT COUNT(*) as count FROM albums WHERE deleted_at IS NULL').get()?.count || 0)
      : 0,
    provider: isNeonConfigured() ? 'neon' : 'sqlite',
    pendingWrites: stats.pendingWrites,
    failedWrites: stats.failedWrites,
    lastWriteOkAt: stats.lastWriteOkAt,
  };
}

/** Admin "Sync" button: flush pending writes and re-push the local cache to Neon (idempotent upserts). */
export async function triggerDatabaseSync(): Promise<{
  success: boolean;
  message: string;
  totalPushed?: number;
  totalRestored?: number;
  counts?: Record<string, number>;
  status: any;
}> {
  if (!dbInstance) throw new Error('Database not initialized');
  if (!isNeonConfigured()) {
    return {
      success: false,
      message: 'DATABASE_URL (Neon) is not configured. Add it in the Render environment variables.',
      status: getDatabaseStatus(),
    };
  }
  try {
    await flushNeonWrites();
    const res = await pushAllLocalToNeon(dbInstance);
    if (res.success) {
      isCloudSynced = true;
      lastSyncTimestamp = new Date().toISOString();
      cloudSyncError = null;
      return {
        success: true,
        message: `Synchronized with Neon (${res.totalPushed} row(s) verified)`,
        totalPushed: res.totalPushed,
        counts: res.counts,
        status: getDatabaseStatus(),
      };
    }
    cloudSyncError = res.error || 'Sync failed';
    return { success: false, message: `Neon sync failed: ${res.error}`, status: getDatabaseStatus() };
  } catch (err: any) {
    cloudSyncError = err?.message || String(err);
    return { success: false, message: `Neon sync exception: ${cloudSyncError}`, status: getDatabaseStatus() };
  }
}

/** Admin "Restore" button: discard the local cache and rebuild it entirely from Neon. */
export async function restoreDatabaseFromCloud(): Promise<{
  success: boolean;
  message: string;
  totalRestored?: number;
  counts?: Record<string, number>;
  status: any;
}> {
  if (!dbInstance) throw new Error('Database not initialized');
  if (!isNeonConfigured()) {
    return {
      success: false,
      message: 'DATABASE_URL (Neon) is not configured. Add it in the Render environment variables.',
      status: getDatabaseStatus(),
    };
  }
  await flushNeonWrites();
  const res = await restoreAllFromNeon(dbInstance, { clearLocalFirst: true });
  if (res.success) {
    isCloudSynced = true;
    lastSyncTimestamp = new Date().toISOString();
    cloudSyncError = null;
    return {
      success: true,
      message: `Restored ${res.totalRestored} record(s) from Neon`,
      totalRestored: res.totalRestored,
      counts: res.counts,
      status: getDatabaseStatus(),
    };
  }
  cloudSyncError = res.error || 'Restore failed';
  return { success: false, message: `Restore from Neon failed: ${res.error}`, status: getDatabaseStatus() };
}

export { flushNeonWrites };

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

  // Mirror every data mutation to Neon (ordered queue, flushed before the HTTP response ends)
  if (shouldForwardToNeon(sql)) {
    pushWriteToNeon(sql, params);
  }
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
      tg_deleted_at TEXT,
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

  // Set when the backing Telegram message was deleted from the channel
  try {
    db.exec('ALTER TABLE post_files ADD COLUMN tg_deleted_at TEXT');
  } catch {}

  // Auto-repair missing or generic captions from storage keys
  try {
    const nameless = db.prepare(
      `SELECT p.id, pf.storage_key
       FROM posts p
       JOIN post_files pf ON pf.post_id = p.id AND pf.position = 0
       WHERE p.caption IS NULL OR p.caption = '' OR p.caption = 'Memory'`
    ).all();
    for (const r of nameless) {
      if (r.storage_key) {
        const filename = r.storage_key.split('/').pop() || r.storage_key;
        const withoutExt = filename.replace(/\.[^/.]+$/, '');
        const cleanName = withoutExt
          .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]?/i, '')
          .replace(/^\d{10,14}[-_]?/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        if (cleanName && cleanName.length > 0 && cleanName.toLowerCase() !== 'memory') {
          const formatted = cleanName.replace(/\b\w/g, (c: string) => c.toUpperCase());
          db.prepare('UPDATE posts SET caption = ? WHERE id = ?').run(formatted, r.id);
        }
      }
    }
  } catch {}
}
