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

/**
 * Restores full database state from Turso Cloud into local SQLite.
 * Pulls all tables, users, original post captions, photos, album connections, and circles.
 */
export async function restoreAllFromTurso(
  localDb: any,
  options: { clearLocalFirst?: boolean } = { clearLocalFirst: true }
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

    // 1. Optionally clear existing local tables first so Turso Cloud is the pristine source of truth
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

        // Run batch insert inside a fast transaction
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
    console.error('Error during Turso Cloud full restore:', err.message || err);
    return {
      success: false,
      totalRestored,
      counts,
      error: err.message || String(err),
    };
  }
}

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
 * Forwards a write statement to Turso Cloud over HTTP
 */
export function pushWriteToTurso(sql: string, params: any[] = []): void {
  const client = getTursoClient();
  if (!client) return;

  client
    .execute({
      sql,
      args: params,
    })
    .catch((err: any) => {
      console.warn('⚠️ Cloud write sync notice:', err.message || err);
    });
}

