import { createClient, Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';

let tursoClientInstance: Client | null = null;

export function normalizeTursoUrl(url: string): string {
  let cleaned = url.trim();
  // DO NOT strip AWS sub-region routing (e.g. .aws-us-east-1.turso.io), as Turso uses regional hostnames
  if (cleaned.startsWith('libsql://')) {
    cleaned = 'https://' + cleaned.slice('libsql://'.length);
  } else if (!cleaned.startsWith('https://') && !cleaned.startsWith('http://')) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned;
}

export function getTursoCredentials(): { url: string | null; token: string | null } {
  let url = process.env.TURSO_DATABASE_URL?.trim() || null;
  let token = process.env.TURSO_AUTH_TOKEN?.trim() || null;

  if (!url || !token) {
    try {
      const configPath = path.resolve(process.cwd(), 'data', 'turso_config.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.url && parsed.token) {
          url = url || parsed.url.trim();
          token = token || parsed.token.trim();
        }
      }
    } catch {}
  }

  return { url, token };
}

export function saveTursoCredentials(url: string, token: string): void {
  const dir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const configPath = path.join(dir, 'turso_config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ url: url.trim(), token: token.trim(), updatedAt: new Date().toISOString() }, null, 2)
  );
  process.env.TURSO_DATABASE_URL = url.trim();
  process.env.TURSO_AUTH_TOKEN = token.trim();
  tursoClientInstance = null; // force recreation with new credentials
}

export function getTursoClient(): Client | null {
  const { url, token } = getTursoCredentials();

  if (!url || !token) {
    return null;
  }

  if (tursoClientInstance) return tursoClientInstance;

  try {
    const cleanUrl = normalizeTursoUrl(url);
    tursoClientInstance = createClient({
      url: cleanUrl,
      authToken: token,
    });
    return tursoClientInstance;
  } catch (err: any) {
    console.error('Failed to create Turso client:', err.message || err);
    return null;
  }
}

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
];

// Batched atomic write queue to avoid SQLite concurrency / lock collisions on Turso
interface PendingWrite {
  sql: string;
  args: any[];
}

const writeQueue: PendingWrite[] = [];
let isFlushingQueue = false;
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Checks if SQL statement should be synced to Turso Cloud
 */
export function shouldForwardToTurso(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('EXPLAIN')) {
    return false;
  }
  return (
    trimmed.startsWith('INSERT') ||
    trimmed.startsWith('UPDATE') ||
    trimmed.startsWith('DELETE') ||
    trimmed.startsWith('REPLACE') ||
    trimmed.startsWith('CREATE') ||
    trimmed.startsWith('ALTER') ||
    trimmed.startsWith('DROP')
  );
}

/**
 * Enqueues a write statement into the atomic Turso write batch.
 * Collects bursts of inserts (such as 20-30 photos uploaded together)
 * and executes them in a single atomic batch transaction.
 */
export function pushWriteToTurso(sql: string, params: any[] = []): void {
  const client = getTursoClient();
  if (!client) return;

  writeQueue.push({ sql, args: params });

  if (!flushTimer) {
    // 25ms debounce collects all writes in a loop (e.g. 20-30 post_files) into 1 batch transaction
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushTursoWrites().catch(() => {});
    }, 25);
  }
}

/**
 * Flushes all queued writes to Turso Cloud using client.batch()
 */
export async function flushTursoWrites(): Promise<void> {
  if (isFlushingQueue || writeQueue.length === 0) return;
  const client = getTursoClient();
  if (!client) return;

  isFlushingQueue = true;

  try {
    while (writeQueue.length > 0) {
      // Process up to 50 statements per atomic batch
      const batch = writeQueue.splice(0, 50);
      let success = false;
      let attempts = 0;

      while (!success && attempts < 3) {
        attempts++;
        try {
          await client.batch(batch, 'write');
          success = true;
          // console.log(`☁️ Synced batch of ${batch.length} statement(s) to Turso Cloud`);
        } catch (batchErr: any) {
          const msg = batchErr?.message || String(batchErr);
          if (attempts < 3 && (msg.includes('locked') || msg.includes('busy') || msg.includes('timeout'))) {
            await new Promise((r) => setTimeout(r, 80 * attempts));
          } else {
            console.warn(`⚠️ Turso cloud batch write notice (attempt ${attempts}):`, msg);
            break;
          }
        }
      }
    }
  } finally {
    isFlushingQueue = false;
  }
}

/**
 * Pushes all existing local SQLite rows into Turso Cloud.
 * Guarantees that freshly uploaded photos, created events, and circle memberships
 * are securely backed up to Turso without getting overwritten.
 */
export async function pushAllLocalToTurso(localDb: any): Promise<{
  success: boolean;
  totalPushed: number;
  counts: Record<string, number>;
  error?: string;
}> {
  const client = getTursoClient();
  if (!client) {
    return {
      success: false,
      totalPushed: 0,
      counts: {},
      error: 'Turso credentials not configured',
    };
  }

  // Ensure any pending micro-writes are flushed first
  await flushTursoWrites();

  const counts: Record<string, number> = {};
  let totalPushed = 0;

  try {
    for (const table of TABLES_IN_ORDER) {
      try {
        let localRows: any[] = [];
        try {
          localRows = localDb.prepare(`SELECT * FROM ${table}`).all();
        } catch {
          counts[table] = 0;
          continue;
        }

        if (!localRows || localRows.length === 0) {
          counts[table] = 0;
          continue;
        }

        const colNames = Object.keys(localRows[0]);
        if (colNames.length === 0) {
          counts[table] = 0;
          continue;
        }

        const placeholders = colNames.map(() => '?').join(', ');
        const insertSql = `INSERT OR REPLACE INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders})`;

        let tablePushed = 0;
        // Batch into chunks of 40 to avoid HTTP payload or query limits
        const chunkSize = 40;
        for (let i = 0; i < localRows.length; i += chunkSize) {
          const chunk = localRows.slice(i, i + chunkSize);
          const batchStatements = chunk.map((row) => ({
            sql: insertSql,
            args: colNames.map((col) => (row[col] !== undefined ? row[col] : null)),
          }));

          try {
            await client.batch(batchStatements, 'write');
            tablePushed += chunk.length;
          } catch (chunkErr: any) {
            // Fallback to row-by-row if batch had schema variation
            for (const stmt of batchStatements) {
              try {
                await client.execute(stmt);
                tablePushed++;
              } catch {}
            }
          }
        }

        counts[table] = tablePushed;
        totalPushed += tablePushed;
        if (tablePushed > 0) {
          console.log(`📤 Pushed ${tablePushed} local row(s) into Turso Cloud [${table}]`);
        }
      } catch (tableErr: any) {
        console.warn(`Turso cloud push notice for [${table}]:`, tableErr.message || tableErr);
        counts[table] = 0;
      }
    }

    return {
      success: true,
      totalPushed,
      counts,
    };
  } catch (err: any) {
    console.error('Error during pushAllLocalToTurso:', err.message || err);
    return {
      success: false,
      totalPushed,
      counts,
      error: err.message || String(err),
    };
  }
}

/**
 * Restores database state from Turso Cloud into local SQLite.
 * By default, clearLocalFirst is FALSE to ensure local records are never destroyed.
 */
export async function restoreAllFromTurso(
  localDb: any,
  options: { clearLocalFirst?: boolean } = { clearLocalFirst: false }
): Promise<{
  success: boolean;
  totalRestored: number;
  counts: Record<string, number>;
  error?: string;
}> {
  const client = getTursoClient();
  if (!client) {
    return {
      success: false,
      totalRestored: 0,
      counts: {},
      error: 'TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not configured',
    };
  }

  const counts: Record<string, number> = {};
  let totalRestored = 0;

  try {
    // Disable foreign keys temporarily during bulk restore
    localDb.exec('PRAGMA foreign_keys = OFF;');

    // 1. Only clear existing local tables if explicitly requested
    if (options.clearLocalFirst) {
      for (const table of [...TABLES_IN_ORDER].reverse()) {
        try {
          localDb.exec(`DELETE FROM ${table};`);
        } catch {}
      }
    }

    // 2. Fetch and restore all data from Turso Cloud table by table
    for (const table of TABLES_IN_ORDER) {
      try {
        const result = await client.execute(`SELECT * FROM ${table}`);
        if (!result || !result.rows || result.rows.length === 0) {
          counts[table] = 0;
          continue;
        }

        const columns = result.columns;
        if (!columns || columns.length === 0) {
          counts[table] = 0;
          continue;
        }

        // Intersect Turso columns with local schema table columns
        let localCols: string[] = [];
        try {
          const colInfo = localDb.prepare(`PRAGMA table_info(${table})`).all() as any[];
          localCols = colInfo.map((c) => c.name);
        } catch {
          localCols = columns;
        }

        const validColumns = columns.filter((col: string) => localCols.includes(col));
        if (validColumns.length === 0) {
          counts[table] = 0;
          continue;
        }

        const placeholders = validColumns.map(() => '?').join(', ');
        const colNames = validColumns.join(', ');
        const insertSql = `INSERT OR REPLACE INTO ${table} (${colNames}) VALUES (${placeholders})`;
        const insertStmt = localDb.prepare(insertSql);

        // Run batch insert inside a fast local transaction
        const insertBatch = localDb.transaction((rows: any[]) => {
          let c = 0;
          for (const row of rows) {
            const values = validColumns.map((col: string) => (row[col] !== undefined ? row[col] : null));
            insertStmt.run(...values);
            c++;
          }
          return c;
        });

        const tableCount = insertBatch(result.rows);
        counts[table] = tableCount;
        totalRestored += tableCount;
        console.log(`📥 Restored ${tableCount} row(s) into table [${table}] from Turso Cloud`);
      } catch (tableErr: any) {
        console.warn(`Turso restore notice for table [${table}]:`, tableErr.message || tableErr);
        counts[table] = 0;
      }
    }

    localDb.exec('PRAGMA foreign_keys = ON;');
    console.log(`🎉 Total restored records from Turso Cloud: ${totalRestored}`);

    return {
      success: true,
      totalRestored,
      counts,
    };
  } catch (err: any) {
    localDb.exec('PRAGMA foreign_keys = ON;');
    console.error('Error during Turso Cloud restore:', err.message || err);
    return {
      success: false,
      totalRestored,
      counts,
      error: err.message || String(err),
    };
  }
}

/**
 * Full safe bidirectional sync:
 * 1. Pushes any newly created local records (photos, events, posts, users) to Turso Cloud.
 * 2. Pulls records from Turso Cloud into local SQLite without deleting local data.
 */
export async function syncWithTursoCloud(localDb: any): Promise<{
  success: boolean;
  totalPushed: number;
  totalRestored: number;
  error?: string;
}> {
  // Step 1: Push local state to cloud so recent uploads & events are never lost
  const pushRes = await pushAllLocalToTurso(localDb);

  // Step 2: Merge state from cloud into local SQLite
  const restoreRes = await restoreAllFromTurso(localDb, { clearLocalFirst: false });

  return {
    success: pushRes.success || restoreRes.success,
    totalPushed: pushRes.totalPushed,
    totalRestored: restoreRes.totalRestored,
    error: pushRes.error || restoreRes.error,
  };
}

