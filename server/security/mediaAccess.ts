import { queryAll } from '../db.ts';
import { canUserViewPost } from './postAccess.ts';

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
 *    comment, member list and timeline card), including Telegram-backed avatar keys
 *  - everyone else needs a post that references this file AND that they may view
 */
export function canAccessStorageKey(viewer: Viewer, rawKey: string): boolean {
  if (viewer.status === 'suspended') return false;
  if (viewer.role === 'admin') return true;

  const key = normaliseKey(rawKey);
  if (!key || key.includes('..')) return false;

  // Profile photos: readable by any non-suspended signed-in user (including a
  // pending user viewing their own profile card, or members seeing Telegram-stored avatars)
  const isUserAvatar =
    key.startsWith('avatars/') ||
    queryAll<{ id: string }>('SELECT id FROM users WHERE avatar_url = ? LIMIT 1', [key]).length > 0;
  if (isUserAvatar) return true;

  if (viewer.role === 'pending') return false;

  // Circle icon / banner: members of that circle (everyone, for the Everyone circle)
  const circleImage = queryAll<{ id: string; is_everyone: number }>(
    'SELECT id, is_everyone FROM groups WHERE icon_key = ? OR banner_key = ? LIMIT 1',
    [key, key]
  );
  if (circleImage.length > 0) {
    const circle = circleImage[0];
    if (circle.is_everyone) return true;
    return (
      queryAll<{ ok: number }>('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1', [
        circle.id,
        viewer.id,
      ]).length > 0
    );
  }

  if (key.startsWith(`posts/${viewer.id}/`)) return true;

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
  const circleImage = queryAll<{ id: string; is_everyone: number }>(
    'SELECT id, is_everyone FROM groups WHERE icon_key LIKE ? OR banner_key LIKE ? LIMIT 1',
    [prefix, prefix]
  );
  if (circleImage.length > 0) {
    const circle = circleImage[0];
    if (circle.is_everyone) return true;
    return (
      queryAll<{ ok: number }>('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1', [
        circle.id,
        viewer.id,
      ]).length > 0
    );
  }
  const rows = queryAll<{ post_id: string }>(
    'SELECT DISTINCT post_id FROM post_files WHERE storage_key LIKE ? OR thumb_key LIKE ?',
    [prefix, prefix]
  );
  return rows.some((r) => canUserViewPost(viewer.id, viewer.role, r.post_id).canView);
}