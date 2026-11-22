import pg from 'pg';
import { logger, errMessage } from './logger.ts';
import type { Db, SqlParam } from './db.ts';

/** A value coming back from / going into a query row. */
type DbValue = string | number | bigint | boolean | null | undefined | Date | Uint8Array;
type ErrLike = { code?: unknown; message?: unknown };

/**
 * Neon (PostgreSQL) persistence layer.
 *
 * Neon is the DURABLE SOURCE OF TRUTH. The app keeps a fast local SQLite copy
 * (see db.ts) for synchronous reads; every write is mirrored here, in order,
 * and the whole database is restored from Neon on every boot.
 *
 *  - Tables are created automatically on boot (ensureNeonSchema).
 *  - Writes are queued and applied in order inside transactions, with retries.
 *  - HTTP responses to write requests wait for the queue to flush (see server.ts),
 *    so when the browser sees "success" the row is already stored in Neon.
 */

const { Pool, types } = pg;

// BIGINT (int8) -> JS number (file sizes can exceed 2 GB-ish ranges but stay far below 2^53)
types.setTypeParser(20, (v: string) => parseInt(v, 10));

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export function getDatabaseUrl(): string | null {
  const url = (
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
  return url || null;
}

export function isNeonConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

/** Host + database name only (never credentials) for diagnostics. */
export function getMaskedNeonTarget(): string | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  try {
    const u = new URL(url);
    return `postgres://${u.host}${u.pathname}`;
  } catch {
    return 'postgres://(invalid DATABASE_URL)';
  }
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const raw = getDatabaseUrl();
  if (!raw) throw new Error('DATABASE_URL is not set');

  // Strip ssl-related query params; we set SSL explicitly below so behaviour is identical
  // for every pg version (pg-connection-string would otherwise override our options).
  let connectionString = raw;
  let useSsl = true;
  try {
    const u = new URL(raw);
    const mode = u.searchParams.get('sslmode');
    if (mode === 'disable') useSsl = false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      if (mode !== 'require') useSsl = false;
    }
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    connectionString = u.toString();
  } catch {
    // keep raw string
  }

  pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 25_000, // Neon can take a few seconds to wake from scale-to-zero
    keepAlive: true,
  });

  // Neon closes idle connections; without this handler an idle-client error would crash the process.
  pool.on('error', (err) => {
    logger.warn('⚠️ [Neon] idle client error (will reconnect automatically):', err.message);
  });

  return pool;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isConnectionError(err: unknown): boolean {
  const e = (err ?? {}) as ErrLike;
  const code: string = typeof e.code === 'string' ? e.code : '';
  const msg: string = String(e.message || '').toLowerCase();
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true;
  if (/^08/.test(code) || /^57P0/.test(code) || code === '53300') return true;
  return (
    msg.includes('connection terminated') ||
    msg.includes('timeout') ||
    msg.includes('terminating connection') ||
    msg.includes('connection closed') ||
    msg.includes('server closed the connection')
  );
}

// ---------------------------------------------------------------------------
// Schema (created automatically)
// ---------------------------------------------------------------------------

export const TABLES_IN_ORDER = [
  'users',
  'groups',
  'group_members',
  'posts',
  'post_files',
  'albums',
  'album_items',
  'item_groups',
  'comments',
  'reactions',
  'mentions',
  'event_attendance',
  'event_notes',
  'notifications',
  'reports',
  'audit_log',
  'ignored_duplicates',
  'sessions',
  'password_resets',
  'login_attempts',
];

const PRIMARY_KEYS: Record<string, string[]> = {
  users: ['id'],
  groups: ['id'],
  group_members: ['group_id', 'user_id'],
  posts: ['id'],
  post_files: ['id'],
  albums: ['id'],
  album_items: ['album_id', 'post_id'],
  item_groups: ['id'],
  comments: ['id'],
  reactions: ['id'],
  mentions: ['id'],
  event_attendance: ['event_id', 'user_id'],
  event_notes: ['id'],
  notifications: ['id'],
  reports: ['id'],
  audit_log: ['id'],
  ignored_duplicates: ['id'],
  sessions: ['token'],
  password_resets: ['token'],
  login_attempts: ['id'],
};

const SCHEMA_STATEMENTS: string[] = [
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
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    creator_id TEXT NOT NULL REFERENCES users(id),
    is_everyone INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
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
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'photo',
    position INTEGER NOT NULL DEFAULT 0,
    thumb_key TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    checksum TEXT,
    tg_deleted_at TEXT
  )`,
  `ALTER TABLE post_files ADD COLUMN IF NOT EXISTS checksum TEXT`,
  `ALTER TABLE post_files ADD COLUMN IF NOT EXISTS tg_deleted_at TEXT`,
  `CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    creator_id TEXT NOT NULL REFERENCES users(id),
    is_event INTEGER NOT NULL DEFAULT 0,
    event_date TEXT,
    event_place TEXT,
    status TEXT NOT NULL DEFAULT 'approved',
    proposal_notes TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS album_items (
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (album_id, post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS item_groups (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    added_by TEXT NOT NULL REFERENCES users(id),
    is_reference INTEGER NOT NULL DEFAULT 0,
    reference_status TEXT NOT NULL DEFAULT 'approved',
    added_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS event_attendance (
    event_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tagged_by TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS event_notes (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'group',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
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
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mentions (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id),
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ignored_duplicates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    match_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, match_key)
  )`,
];

/**
 * Creates every table in Neon if it does not exist yet. Safe to run on every boot.
 * Uses a transaction-scoped advisory lock so two instances booting at once cannot race each other.
 */
export async function ensureNeonSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Transaction-scoped lock: released automatically on COMMIT/ROLLBACK (works with pooled connections)
    await client.query('SELECT pg_advisory_xact_lock(727274)');
    for (const stmt of SCHEMA_STATEMENTS) {
      await client.query(stmt);
    }
    await client.query('COMMIT');
    logger.info(`🗄️  [Neon] Schema ready (${TABLES_IN_ORDER.length} tables verified/created)`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // rollback failed; the connection is discarded by the caller
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Connects (with retries for Neon cold starts) and makes sure the schema exists. */
export async function connectNeon(maxAttempts = 6): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await getPool().query('SELECT 1');
      await ensureNeonSchema();
      return;
    } catch (err) {
      lastErr = err;
      logger.warn(`⚠️ [Neon] connect attempt ${attempt}/${maxAttempts} failed: ${errMessage(err) || err}`);
      if (attempt < maxAttempts) await sleep(1500 * attempt);
    }
  }
  throw new Error(
    `Could not connect to Neon database. Check DATABASE_URL. Last error: ${errMessage(lastErr) || String(lastErr)}`
  );
}

export async function countNeonRows(table: string): Promise<number> {
  const r = await getPool().query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return r.rows[0]?.c ?? 0;
}

// ---------------------------------------------------------------------------
// SQLite -> Postgres statement translation (only writes are forwarded)
// ---------------------------------------------------------------------------

export function shouldForwardToNeon(sql: string): boolean {
  const t = sql.trim().toUpperCase();
  return t.startsWith('INSERT') || t.startsWith('UPDATE') || t.startsWith('DELETE') || t.startsWith('REPLACE');
}

function normalizeValue(v: DbValue): string | number | Uint8Array | null {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  return v;
}

export function translateToPg(sql: string, params: SqlParam[] = []): { text: string; values: unknown[] } {
  let s = sql.trim().replace(/;+\s*$/, '');
  let conflict = '';

  if (/^INSERT\s+OR\s+IGNORE\s+INTO\s/i.test(s)) {
    s = s.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\s/i, 'INSERT INTO ');
    conflict = ' ON CONFLICT DO NOTHING';
  } else if (/^(INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\s/i.test(s)) {
    s = s.replace(/^(INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\s/i, 'INSERT INTO ');
    const m = /^INSERT INTO\s+(\w+)\s*\(([^)]*)\)/i.exec(s);
    const table = m ? m[1].toLowerCase() : '';
    const pk = PRIMARY_KEYS[table];
    if (m && pk) {
      const cols = m[2].split(',').map((c) => c.trim());
      const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
      conflict = updates.length
        ? ` ON CONFLICT (${pk.join(', ')}) DO UPDATE SET ${updates.join(', ')}`
        : ` ON CONFLICT (${pk.join(', ')}) DO NOTHING`;
    }
  }
  s += conflict;

  // ? -> $1, $2 ... (ignoring question marks inside single-quoted string literals)
  let out = '';
  let n = 0;
  let inStr = false;
  for (const ch of s) {
    if (ch === "'") inStr = !inStr;
    if (ch === '?' && !inStr) {
      n++;
      out += `$${n}`;
    } else {
      out += ch;
    }
  }

  return { text: out, values: params.map(normalizeValue) };
}

// ---------------------------------------------------------------------------
// Ordered write-through queue
// ---------------------------------------------------------------------------

interface PendingWrite {
  sql: string;
  params: SqlParam[];
}

const writeQueue: PendingWrite[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let flushing: Promise<void> | null = null;

let failedWrites = 0;
let lastWriteError: string | null = null;
let lastWriteOkAt: string | null = null;

export function getWriteStats() {
  return {
    pendingWrites: writeQueue.length,
    failedWrites,
    lastWriteError,
    lastWriteOkAt,
  };
}

/** Queue a write for Neon. Called by run() for every INSERT / UPDATE / DELETE. */
export function pushWriteToNeon(sql: string, params: SqlParam[] = []): void {
  if (!isNeonConfigured()) return;
  writeQueue.push({ sql, params });
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushNeonWrites().catch(() => {});
    }, 5);
  }
}

async function applyBatchAtomically(batch: PendingWrite[]): Promise<boolean> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let client: pg.PoolClient | null = null;
    try {
      client = await getPool().connect();
      await client.query('BEGIN');
      for (const st of batch) {
        const t = translateToPg(st.sql, st.params);
        await client.query(t.text, t.values);
      }
      await client.query('COMMIT');
      client.release();
      return true;
    } catch (err) {
      const connErr = isConnectionError(err);
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // rollback failed; the connection is discarded by the caller
        }
        client.release(connErr ? (err as Error) : undefined);
      }
      if (connErr && attempt < 6) {
        await sleep(400 * attempt);
        continue;
      }
      return false; // SQL-level problem (or retries exhausted): caller falls back to one-by-one
    }
  }
  return false;
}

async function applyOneByOne(batch: PendingWrite[]): Promise<void> {
  for (const st of batch) {
    const t = translateToPg(st.sql, st.params);
    let done = false;
    for (let attempt = 1; attempt <= 5 && !done; attempt++) {
      try {
        await getPool().query(t.text, t.values);
        done = true;
      } catch (err) {
        if (isConnectionError(err) && attempt < 5) {
          await sleep(500 * attempt);
          continue;
        }
        failedWrites++;
        lastWriteError = `${errMessage(err) || err} | ${st.sql.replace(/\s+/g, ' ').slice(0, 140)}`;
        logger.error('❌ [Neon] write failed:', lastWriteError);
        done = true; // skip this statement so the queue keeps moving
      }
    }
  }
}

export async function flushNeonWrites(): Promise<void> {
  if (!isNeonConfigured()) return;
  // Wait for any in-flight flush, then make sure nothing queued meanwhile is left behind
  while (flushing || writeQueue.length > 0) {
    if (flushing) {
      await flushing.catch(() => {});
      continue;
    }
    flushing = (async () => {
      while (writeQueue.length > 0) {
        const batch = writeQueue.splice(0, 100);
        const ok = await applyBatchAtomically(batch);
        if (ok) {
          lastWriteOkAt = new Date().toISOString();
        } else {
          await applyOneByOne(batch);
        }
      }
    })().finally(() => {
      flushing = null;
    });
  }
}

// ---------------------------------------------------------------------------
// Restore (Neon -> local SQLite) and push (local SQLite -> Neon)
// ---------------------------------------------------------------------------

export async function restoreAllFromNeon(
  localDb: Db,
  options: { clearLocalFirst?: boolean } = { clearLocalFirst: true }
): Promise<{ success: boolean; totalRestored: number; counts: Record<string, number>; error?: string }> {
  const counts: Record<string, number> = {};
  let totalRestored = 0;
  try {
    localDb.exec('PRAGMA foreign_keys = OFF;');

    if (options.clearLocalFirst) {
      for (const table of [...TABLES_IN_ORDER].reverse()) {
        try {
          localDb.exec(`DELETE FROM ${table};`);
        } catch {
          // table may not exist locally yet
        }
      }
    }

    for (const table of TABLES_IN_ORDER) {
      const result = await getPool().query(`SELECT * FROM ${table}`);
      if (!result.rows.length) {
        counts[table] = 0;
        continue;
      }
      const columns = result.fields.map((f) => f.name);

      let localCols: string[] = columns;
      try {
        const info = localDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        localCols = info.map((c) => c.name);
      } catch {
        // fall back to Neon's column list
      }

      const valid = columns.filter((c) => localCols.includes(c));
      if (!valid.length) {
        counts[table] = 0;
        continue;
      }

      const stmt = localDb.prepare(
        `INSERT OR REPLACE INTO ${table} (${valid.join(', ')}) VALUES (${valid.map(() => '?').join(', ')})`
      );
      const insertAll = localDb.transaction((rows: Array<Record<string, DbValue>>) => {
        for (const row of rows) {
          stmt.run(...valid.map((c) => normalizeValue(row[c] === undefined ? null : row[c])));
        }
        return rows.length;
      });
      counts[table] = insertAll(result.rows);
      totalRestored += counts[table];
    }

    localDb.exec('PRAGMA foreign_keys = ON;');
    logger.info(`📥 [Neon] Restored ${totalRestored} row(s) from Neon into the local cache`);
    return { success: true, totalRestored, counts };
  } catch (err) {
    try {
      localDb.exec('PRAGMA foreign_keys = ON;');
    } catch {
      // pragma not supported on this connection; safe to continue
    }
    logger.error('❌ [Neon] restore failed:', errMessage(err) || err);
    return { success: false, totalRestored, counts, error: errMessage(err) || String(err) };
  }
}

export async function pushAllLocalToNeon(
  localDb: Db
): Promise<{ success: boolean; totalPushed: number; counts: Record<string, number>; error?: string }> {
  await flushNeonWrites();
  const counts: Record<string, number> = {};
  let totalPushed = 0;
  try {
    for (const table of TABLES_IN_ORDER) {
      let rows: Array<Record<string, DbValue>> = [];
      try {
        rows = localDb.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, DbValue>>;
      } catch {
        counts[table] = 0;
        continue;
      }
      if (!rows.length) {
        counts[table] = 0;
        continue;
      }
      const cols = Object.keys(rows[0]).filter((c) => c !== '_metadata');
      const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;

      let pushed = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const stmts: PendingWrite[] = chunk.map((r) => ({ sql, params: cols.map((c) => normalizeValue(r[c])) }));
        const ok = await applyBatchAtomically(stmts);
        if (ok) {
          pushed += chunk.length;
        } else {
          for (const st of stmts) {
            try {
              const t = translateToPg(st.sql, st.params);
              await getPool().query(t.text, t.values);
              pushed++;
            } catch (err) {
              logger.warn(`⚠️ [Neon] skipped a row in ${table}: ${errMessage(err) || err}`);
            }
          }
        }
      }
      counts[table] = pushed;
      totalPushed += pushed;
    }
    logger.info(`📤 [Neon] Pushed ${totalPushed} local row(s) into Neon`);
    return { success: true, totalPushed, counts };
  } catch (err) {
    logger.error('❌ [Neon] push failed:', errMessage(err) || err);
    return { success: false, totalPushed, counts, error: errMessage(err) || String(err) };
  }
}

export async function closeNeon(): Promise<void> {
  try {
    await flushNeonWrites();
  } catch {
    // shutting down: ignore flush errors
  }
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}
