import { getStorageAdapter } from './index.ts';
import { queryAll, run } from '../db.ts';
import { parseTelegramKey } from './telegram.ts';

/**
 * Detects media that was deleted from the Telegram channel and flags it in the database
 * (post_files.tg_deleted_at) so the website can show a "Deleted from Telegram" tag.
 *
 * Telegram bots are never notified about deletions, so we poll:
 *  - MTProto (`tgmsg:`) files are checked in cheap batches of 100 message ids.
 *  - Bot API files stored with a message id (`tg:<file_id>@<msg_id>/name`) are probed one by one,
 *    so only a rotating slice is checked per run to stay far below Telegram rate limits.
 *  - A file flagged as deleted that reappears (message restored) is un-flagged automatically.
 */

const BOT_CHECKS_PER_RUN = Number(process.env.TELEGRAM_DELETE_CHECK_BOT_BATCH) || 60;

let running = false;
let botCursor = 0;
let timer: NodeJS.Timeout | null = null;

export interface DeletionScanResult {
  checked: number;
  newlyDeleted: number;
  restored: number;
  unknown: number;
  skipped?: boolean;
}

export async function scanTelegramDeletions(): Promise<DeletionScanResult> {
  const result: DeletionScanResult = { checked: 0, newlyDeleted: 0, restored: 0, unknown: 0 };
  if (running) return { ...result, skipped: true };
  running = true;

  try {
    const storage = getStorageAdapter();
    if (!storage.checkTelegramExistence) return { ...result, skipped: true };

    const rows = queryAll<{ id: string; storage_key: string; tg_deleted_at: string | null }>(
      "SELECT id, storage_key, tg_deleted_at FROM post_files WHERE storage_key LIKE 'tg:%' OR storage_key LIKE 'tgmsg:%'"
    );
    if (rows.length === 0) return result;

    const mtprotoRows: typeof rows = [];
    const botRows: typeof rows = [];
    for (const r of rows) {
      const parsed = parseTelegramKey(r.storage_key);
      if (!parsed) continue;
      if (parsed.lane === 'mtproto') mtprotoRows.push(r);
      else if (parsed.msgId) botRows.push(r);
    }

    // Rotating window over the Bot API files
    let botSlice: typeof rows = [];
    if (botRows.length > 0) {
      if (botCursor >= botRows.length) botCursor = 0;
      botSlice = botRows.slice(botCursor, botCursor + BOT_CHECKS_PER_RUN);
      botCursor += BOT_CHECKS_PER_RUN;
    }

    const toCheck = [...mtprotoRows, ...botSlice];
    if (toCheck.length === 0) return result;

    const statuses = await storage.checkTelegramExistence(toCheck.map((r) => r.storage_key));
    const now = new Date().toISOString();

    for (const r of toCheck) {
      const status = statuses[r.storage_key] || 'unknown';
      result.checked++;
      if (status === 'deleted' && !r.tg_deleted_at) {
        run('UPDATE post_files SET tg_deleted_at = ? WHERE id = ?', [now, r.id]);
        result.newlyDeleted++;
      } else if (status === 'exists' && r.tg_deleted_at) {
        run('UPDATE post_files SET tg_deleted_at = NULL WHERE id = ?', [r.id]);
        result.restored++;
      } else if (status === 'unknown') {
        result.unknown++;
      }
    }

    if (result.newlyDeleted > 0 || result.restored > 0) {
      console.log(
        `🗑️ [Telegram Sync] ${result.newlyDeleted} file(s) newly flagged as deleted from Telegram, ${result.restored} restored.`
      );
    }
    return result;
  } catch (err: any) {
    console.warn('⚠️ [Telegram Sync] Deletion scan failed:', err?.message || err);
    return result;
  } finally {
    running = false;
  }
}

/** Starts the periodic background scan (default every 5 minutes; set TELEGRAM_DELETE_CHECK_MINUTES=0 to disable). */
export function startTelegramDeletionWatcher(): void {
  if (timer) return;
  const minutesRaw = process.env.TELEGRAM_DELETE_CHECK_MINUTES;
  const minutes = minutesRaw === undefined || minutesRaw === '' ? 5 : Number(minutesRaw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log('🗑️ [Telegram Sync] Deletion watcher disabled.');
    return;
  }
  setTimeout(() => scanTelegramDeletions().catch(() => {}), 20_000);
  timer = setInterval(() => scanTelegramDeletions().catch(() => {}), minutes * 60_000);
  timer.unref?.();
  console.log(`🗑️ [Telegram Sync] Watching for media deleted from Telegram every ${minutes} min.`);
}

export function stopTelegramDeletionWatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
