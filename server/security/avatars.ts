/* Uploaded profile photos are stored as an object key in `users.avatar_url`;
   every API that returns a person maps that key through this helper so the
   client can drop it straight into an <img src>. */

export function avatarUrlFor(key?: string | null): string | undefined {
  if (!key) return undefined;
  return `/api/storage/view?key=${encodeURIComponent(key)}`;
}
