export function isDeleteProtected(): boolean {
  // When running on Render (Render automatically sets RENDER=true in production environment)
  // or when explicitly enabled with ALLOW_DELETE=true, deletion is fully operational.
  if (process.env.RENDER === 'true' || process.env.RENDER === '1' || process.env.ALLOW_DELETE === 'true') {
    return false;
  }
  // In the AI Studio preview environment, deletion is protected to safeguard live user photos and data.
  return true;
}

export const isPreviewEnvironment = isDeleteProtected;

