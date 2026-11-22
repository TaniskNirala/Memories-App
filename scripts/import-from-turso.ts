/**
 * OPTIONAL one-time import: copies everything from your old Turso database into Neon.
 *
 *   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." DATABASE_URL="postgres://..." npm run import:turso
 *
 * Safe to run more than once (rows are upserted by primary key). Rows that cannot be inserted
 * (for example orphaned rows whose user no longer exists) are skipped and reported.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { connectNeon, getPool, TABLES_IN_ORDER, translateToPg, closeNeon } from '../server/neon.ts';

function normalizeTursoUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith('libsql://')) return 'https://' + u.slice('libsql://'.length);
  return u; // https://..., http://... or file:...
}

async function main() {
  const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
  const tursoToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (!tursoUrl) throw new Error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) to import from Turso.');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your Neon connection string.');

  const turso = createClient({ url: normalizeTursoUrl(tursoUrl), authToken: tursoToken || undefined });
  await connectNeon();

  let total = 0;
  for (const table of TABLES_IN_ORDER) {
    let rows: any[] = [];
    let columns: string[] = [];
    try {
      const res = await turso.execute(`SELECT * FROM ${table}`);
      rows = res.rows as any[];
      columns = res.columns;
    } catch (err: any) {
      console.log(`- ${table}: not found in Turso (${String(err?.message || err).slice(0, 60)}), skipped`);
      continue;
    }
    if (!rows.length) {
      console.log(`- ${table}: 0 rows`);
      continue;
    }

    // Only copy columns that exist in Neon
    const probe = await getPool().query(`SELECT * FROM ${table} LIMIT 0`);
    const neonCols = new Set(probe.fields.map((f) => f.name));
    const cols = columns.filter((c) => neonCols.has(c));
    const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;

    let ok = 0;
    let skipped = 0;
    for (const row of rows) {
      const t = translateToPg(sql, cols.map((c) => (row as any)[c] ?? null));
      try {
        await getPool().query(t.text, t.values);
        ok++;
      } catch (err: any) {
        skipped++;
        if (skipped <= 3) console.warn(`  skipped a ${table} row: ${err?.message}`);
      }
    }
    total += ok;
    console.log(`- ${table}: imported ${ok}${skipped ? `, skipped ${skipped}` : ''}`);
  }

  console.log(`\nDone. ${total} row(s) imported into Neon.`);
  await closeNeon();
}

main().catch((err) => {
  console.error('Import failed:', err?.message || err);
  process.exit(1);
});
