import type { ServerResponse } from 'http';

// Active SSE upload progress listeners keyed by uploadId (NotaForge two-phase progress)
export const uploadProgressClients = new Map<string, ServerResponse>();

export function emitUploadProgress(uploadId: string | null, pct: number): void {
  if (!uploadId) return;
  const clientRes = uploadProgressClients.get(uploadId);
  if (clientRes && !clientRes.writableEnded) {
    try {
      clientRes.write(`data: ${Math.min(100, Math.max(0, Math.round(pct)))}\n\n`);
    } catch {
      // client disconnected; progress updates are optional
    }
  }
}

export function emitUploadDone(uploadId: string | null): void {
  if (!uploadId) return;
  const clientRes = uploadProgressClients.get(uploadId);
  if (clientRes && !clientRes.writableEnded) {
    try {
      clientRes.write(`event: done\ndata: 100\n\n`);
      clientRes.end();
    } catch {
      // client disconnected; progress updates are optional
    }
  }
  uploadProgressClients.delete(uploadId);
}
