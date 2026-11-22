import { queryAll } from '../db.ts';
import { canUserViewPost } from '../routes/posts.ts';

interface Viewer {
  id: string;
  role: string;
  status: string;
}

export function normaliseKey(raw: string): string {
  let key = String(raw || '').trim();
  for (let i = 0; i < 3 && key.includes('%'); i++) {
    try {
      const decoded = decodeURIComponent(key);
      if (decoded === key) break;
      key = decoded;
    } catch {
      break;
    }
  }
  return key.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
}

function keyMatchesAnyAvatar(key: string): boolean {
  try {
    return queryAll<{ id: string }>('SELECT id FROM users WHERE avatar_url = ? LIMIT 1', [key]).length > 0;
  } catch {
    return false;
  }
}

function alternateKeys(key: string): string[] {
  const keys = new Set<string>([key]);
  if (key.includes('_thumb')) {
    keys.add(key.replace(/_thumb(\.[A-Za-z0-9]+)$/, '$1'));
  } else {
    const m = /^(.*)(\.[A-Za-z0-9]+)$/.exec(key);
    if (m) keys.add(`${m[1]}_thumb${m[2]}`);
  }
  return [...keys];
}

/**
 * Per-file authorization for session users:
 *  - admins can read everything
 *  - owners can read anything under posts/<their id>/
 *  - profile photos are public to signed-in members (they appear beside every
 *    comment, member list and timeline card)
 *  - everyone else needs a post that references this file AND that they may view
 */
export function canAccessStorageKey(viewer: Viewer, rawKey: string): boolean {
  if (viewer.status === 'suspended' || viewer.role === 'pending') return false;
  if (viewer.role === 'admin') return true;

  const key = normaliseKey(rawKey);
  if (!key || key.includes('..')) return false;

  if (key.startsWith(`posts/${viewer.id}/`)) return true;

  // Profile photos: readable by any active member, writable only via /api/auth/avatar.
  // Keys are normally `avatars/<userId>/<file>`, but a Telegram/S3 lane may have
  // rewritten the stored key (e.g. `tg:<file_id>@<msg>/name`), so match the users
  // table as well — otherwise an uploaded photo 404s and the avatar silently
  // falls back to the colour tile.
  if (key.startsWith('avatars/')) return true;
  if (keyMatchesAnyAvatar(key)) return true;

  const candidates = alternateKeys(key);
  const placeholders = candidates.map(() => '?').join(',');
  let rows = queryAll<{ post_id: string }>(
    `SELECT DISTINCT post_id FROM post_files WHERE storage_key IN (${placeholders}) OR thumb_key IN (${placeholders})`,
    [...candidates, ...candidates]
  );

  // Telegram message keys: tgmsg:<id>/<name> (the name part can differ between URLs and stored keys)
  const tg = /^tgmsg:(\d+)(?:\/|$)/.exec(key);
  if (rows.length === 0 && tg) {
    const prefix = `tgmsg:${tg[1]}/%`;
    rows = queryAll<{ post_id: string }>(
      'SELECT DISTINCT post_id FROM post_files WHERE storage_key LIKE ? OR thumb_key LIKE ?',
      [prefix, prefix]
    );
  }

  for (const r of rows) {
    if (canUserViewPost(viewer.id, viewer.role, r.post_id).canView) return true;
  }
  return false;
}

/** For /api/storage/file/:msgId URLs (Telegram) where only the message id is known. */
export function canAccessTelegramMessage(viewer: Viewer, msgId: string): boolean {
  if (viewer.status === 'suspended' || viewer.role === 'pending') return false;
  if (viewer.role === 'admin') return true;
  const prefix = `tgmsg:${parseInt(msgId, 10)}/%`;
  const rows = queryAll<{ post_id: string }>(
    'SELECT DISTINCT post_id FROM post_files WHERE storage_key LIKE ? OR thumb_key LIKE ?',
    [prefix, prefix]
  );
  return rows.some((r) => canUserViewPost(viewer.id, viewer.role, r.post_id).canView);
}
