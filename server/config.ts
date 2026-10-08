export function isDeleteProtected(): boolean {
  // Deletion is enabled by default so users can manage and delete memories, photos, and albums.
  // Can be explicitly protected by setting PROTECT_DELETE=true if desired.
  if (process.env.PROTECT_DELETE === 'true' || process.env.PROTECT_DELETE === '1') {
    return true;
  }
  return false;
}

export const isPreviewEnvironment = isDeleteProtected;


