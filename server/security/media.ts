import path from 'path';

/** Only these extensions may be uploaded or served from the uploads area. No html/svg/js. */
export const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif', '.bmp',
  '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.3gp', '.avi',
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac',
]);

export const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.3gp': 'video/3gpp', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
};

export function isAllowedMediaName(name: string): boolean {
  return ALLOWED_MEDIA_EXTENSIONS.has(path.extname(name || '').toLowerCase());
}

/** Returns a safe, allow-listed extension (with dot) or the fallback. */
export function safeExtension(name: string | undefined, fallback = '.jpg'): string {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ALLOWED_MEDIA_EXTENSIONS.has(ext) ? ext : fallback;
}

export function isAllowedUploadMime(mime: string | undefined): boolean {
  const m = String(mime || '').toLowerCase();
  return m.startsWith('image/') && m !== 'image/svg+xml' ? true : m.startsWith('video/') || m.startsWith('audio/');
}
