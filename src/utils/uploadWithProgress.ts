import { apiFetch, getAuthToken } from '../context/AuthContext.tsx';

export interface StorageCapabilitiesResponse {
  backend: 'telegram' | 's3' | 'local';
  mode: string;
  maxFileSizeBytes: number;
  maxFileSizeLabel: string;
  botApiEnabled: boolean;
  mtprotoEnabled: boolean;
  mtprotoMode: 'embedded' | 'external' | 'none';
  customBotApiUrl: boolean;
  b2FallbackEnabled: boolean;
  archiveOnDelete: boolean;
  mtprotoConnected?: boolean;
  channelTitle?: string | null;
}

export async function fetchStorageCapabilities(): Promise<StorageCapabilitiesResponse | null> {
  try {
    const res = await apiFetch('/api/posts/storage-capabilities');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

/**
 * NotaForge-style Two-Phase Upload Runner:
 * - Phase 1 (0–30%): Browser -> Nest Server transfer via XMLHttpRequest upload progress
 * - Phase 2 (30–100%): Nest Server -> Telegram MTProto / Bot API progress via authenticated SSE stream
 */
export async function uploadFileWithProgress(
  formData: FormData,
  options: {
    onProgress?: (pct: number, phase: 'server' | 'cloud') => void;
    useTwoPhaseSse?: boolean;
  } = {}
): Promise<any> {
  const { onProgress, useTwoPhaseSse = true } = options;
  const uploadId = useTwoPhaseSse
    ? `${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
    : null;

  const sseAbort = new AbortController();

  // Open authenticated SSE progress listener before sending upload so Phase 2 events are never missed
  if (uploadId && onProgress) {
    (async () => {
      try {
        const sseRes = await apiFetch(`/api/posts/upload-progress/${uploadId}`, {
          signal: sseAbort.signal,
        }, 0);
        if (!sseRes.ok || !sseRes.body) return;

        const reader = sseRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const tgPct = parseInt(line.slice(5).trim(), 10);
              if (!Number.isNaN(tgPct)) {
                // Map Telegram's 0–100% into 30–99% on the UI progress bar
                onProgress(30 + Math.round(tgPct * 0.69), 'cloud');
              }
            }
          }
        }
      } catch {
        // Stream aborted cleanly on completion
      }
    })();
  }

  try {
    const url = uploadId ? `/api/posts/upload-file?uploadId=${encodeURIComponent(uploadId)}` : '/api/posts/upload-file';
    const token = getAuthToken();

    const data = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.withCredentials = true;
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            const pct = Math.round((e.loaded / e.total) * (useTwoPhaseSse ? 30 : 90));
            onProgress(Math.min(useTwoPhaseSse ? 30 : 90, pct), 'server');
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100, 'cloud');
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Invalid JSON response from upload server'));
          }
        } else {
          try {
            const errJson = JSON.parse(xhr.responseText);
            reject(new Error(errJson.error || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload'));
      xhr.send(formData);
    });

    return data;
  } finally {
    sseAbort.abort();
  }
}
