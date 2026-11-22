/* Uploaded profile photos are stored as an object key in `users.avatar_url`;
   every API that returns a person maps that key through this helper so the
   client can drop it straight into an <img src>. */

/** Mirrors mediaAccess.normaliseKey — kept local so this module stays import-free
    (mediaAccess already depends on the route layer, so importing it here would
    create a cycle). */
function normalise(raw: string): string {
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

/**
 * Keys look like `avatars/<userId>/<timestamp>_<uuid>.<ext>` — the same shape
 * post media uses (`posts/<userId>/…`), which means the owner check and the
 * "same upload under another extension" fallbacks already understand them.
 *
 * Older rows may hold a bare `avatars/<file>` or a `tg:`/`tgmsg:` key returned
 * by the Telegram storage lane; those keep working because the prefix, not the
 * shape, is what the access rules key on.
 */
export function avatarUrlFor(key?: string | null): string | undefined {
  if (!key) return undefined;
  return `/api/storage/view?key=${encodeURIComponent(key)}`;
}

/** True for any key that belongs to a profile photo, whatever lane stored it. */
export function isAvatarKey(rawKey?: string | null): boolean {
  if (!rawKey) return false;
  return normalise(String(rawKey)).startsWith('avatars/');
}

/** The user id an avatar key belongs to, when the key is namespaced. */
export function avatarOwnerId(rawKey?: string | null): string | undefined {
  if (!isAvatarKey(rawKey)) return undefined;
  const parts = normalise(String(rawKey)).split('/');
  return parts.length >= 3 ? parts[1] : undefined;
}
