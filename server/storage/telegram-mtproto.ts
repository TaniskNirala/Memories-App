import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';
import bigInt from 'big-integer';

const DOC_TTL_MS = 20 * 60 * 1000;
const DOC_CACHE_MAX = 500;
const CHUNK_SIZE = 512 * 1024; // 512 KB aligned MTProto chunk size
const OPEN_RANGE_CAP = 16 * 1024 * 1024; // 16 MB cap per open-ended range request

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
};

export function resolveMimeType(upstreamMime: string | undefined | null, fileName: string): string {
  if (upstreamMime && upstreamMime !== 'application/octet-stream') {
    return upstreamMime;
  }
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || upstreamMime || 'application/octet-stream';
}

export function sanitizeFileName(raw: string): string {
  const base = path.basename(raw || 'file');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(0, 120) || 'file.bin';
}

export function parseTelegramServerUrl(rawUrl?: string): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('⚠️ Ignoring invalid Telegram server URL protocol (must be http/https)');
      return null;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    console.warn('⚠️ Ignoring malformed Telegram server URL');
    return null;
  }
}

export interface MtprotoConfig {
  apiId?: number;
  apiHash?: string;
  session?: string;
  chatId?: string;
  externalServerUrl?: string;
}

interface CachedDoc {
  doc: any;
  ts: number;
}

/**
 * NotaForge-parity MTProto Telegram storage client.
 * Supports two modes seamlessly:
 * 1. Embedded GramJS MTProto (runs inside Kinfolk's Express server — single Render service, up to 2 GB).
 * 2. External NotaForge Server (`TELEGRAM_MTPROTO_SERVER_URL`) for delegating to an existing standalone Render deployment.
 */
export class TelegramMtprotoClient {
  private readonly mode: 'embedded' | 'external' | 'none';
  private readonly apiId: number;
  private readonly apiHash: string;
  private readonly sessionStr: string;
  private readonly rawChatId: string;
  private readonly channelIdStr: string;
  private readonly externalServerUrl: string | null;

  private client: TelegramClient | null = null;
  private channelEntity: any = null;
  private channelTitle: string | null = null;
  private connecting: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private docCache: Map<number, CachedDoc> = new Map();

  constructor(config: MtprotoConfig) {
    this.apiId = Number(config.apiId) || 0;
    this.apiHash = (config.apiHash || '').trim();
    this.sessionStr = (config.session || '').trim();
    this.rawChatId = (config.chatId || '').trim();
    this.channelIdStr = this.rawChatId.replace(/^-100/, '');
    this.externalServerUrl = parseTelegramServerUrl(config.externalServerUrl);

    if (this.apiId > 0 && this.apiHash && this.sessionStr && this.rawChatId) {
      this.mode = 'embedded';
      this.initEmbeddedClient();
    } else if (this.externalServerUrl) {
      this.mode = 'external';
      console.log(`📡 [Telegram MTProto] Configured in External NotaForge Server mode (${this.externalServerUrl})`);
    } else {
      this.mode = 'none';
    }
  }

  public isEnabled(): boolean {
    return this.mode !== 'none';
  }

  public getMode(): 'embedded' | 'external' | 'none' {
    return this.mode;
  }

  public isConnected(): boolean {
    if (this.mode === 'embedded') {
      return Boolean(this.client?.connected);
    }
    return this.mode === 'external';
  }

  public getChannelTitle(): string | null {
    return this.channelTitle;
  }

  private initEmbeddedClient(): void {
    this.client = new TelegramClient(
      new StringSession(this.sessionStr),
      this.apiId,
      this.apiHash,
      {
        connectionRetries: Infinity,
        retryDelay: 2000,
        autoReconnect: true,
        useWSS: false,
        floodSleepThreshold: 60,
      }
    );
    this.client.setLogLevel('warn' as any);

    // Connect eagerly in background so first upload/video stream is instant
    this.ensureConnected().catch((err) => {
      console.warn('⚠️ [Telegram MTProto] Initial connection notice (will auto-retry on demand):', err?.message || err);
    });

    // 60-second heartbeat keeps the socket warm and repairs silent drops (NotaForge pattern)
    this.heartbeatTimer = setInterval(async () => {
      if (!this.client) return;
      try {
        if (!this.client.connected) {
          await this.hardReconnect();
        } else {
          await this.client.getMe();
        }
      } catch (err: any) {
        console.warn('⚠️ [Telegram MTProto] Health check failed, reconnecting:', err?.message || err);
        this.hardReconnect().catch((e) =>
          console.warn('⚠️ [Telegram MTProto] Reconnect attempt failed:', e?.message || e)
        );
      }
    }, 60 * 1000);
    this.heartbeatTimer.unref?.();
  }

  private async resolveChannel(): Promise<any> {
    if (this.channelEntity) return this.channelEntity;
    if (!this.client) throw new Error('MTProto client not initialized');

    // Warm entity cache via dialogs (matches NotaForge)
    await this.client.getDialogs({ limit: 100 });

    const candidates: Array<any> = [];
    if (/^\d+$/.test(this.channelIdStr)) {
      candidates.push(new Api.PeerChannel({ channelId: bigInt(this.channelIdStr) }));
      candidates.push(bigInt(this.channelIdStr));
      candidates.push(BigInt(this.channelIdStr));
    }
    if (/^-?\d+$/.test(this.rawChatId) && this.rawChatId !== this.channelIdStr) {
      candidates.push(bigInt(this.rawChatId));
      candidates.push(BigInt(this.rawChatId));
    }
    candidates.push(this.rawChatId);

    let lastErr: any = null;
    for (const candidate of candidates) {
      try {
        this.channelEntity = await this.client.getEntity(candidate);
        this.channelTitle = this.channelEntity?.title || this.channelEntity?.username || this.channelIdStr;
        console.log(`✅ [Telegram MTProto] Connected to channel: ${this.channelTitle}`);
        return this.channelEntity;
      } catch (err) {
        lastErr = err;
      }
    }

    throw new Error(
      `Could not resolve Telegram channel (${this.rawChatId}). Ensure the session account is a member/admin of the channel. ${lastErr?.message || ''}`
    );
  }

  private async ensureConnected(): Promise<any> {
    if (this.mode !== 'embedded' || !this.client) {
      throw new Error('Embedded MTProto client is not configured');
    }
    if (this.connecting) {
      await this.connecting;
      return this.channelEntity || this.resolveChannel();
    }
    if (this.client.connected && this.channelEntity) {
      return this.channelEntity;
    }

    this.connecting = (async () => {
      if (!this.client!.connected) {
        await this.client!.connect();
      }
      await this.resolveChannel();
    })().finally(() => {
      this.connecting = null;
    });

    await this.connecting;
    return this.channelEntity;
  }

  private async hardReconnect(): Promise<void> {
    if (this.mode !== 'embedded' || !this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      this.channelEntity = null;
      try {
        await this.client!.disconnect();
      } catch {}
      await this.client!.connect();
      await this.resolveChannel();
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private cacheGet(msgId: number): any | null {
    const entry = this.docCache.get(msgId);
    if (!entry) return null;
    if (Date.now() - entry.ts > DOC_TTL_MS) {
      this.docCache.delete(msgId);
      return null;
    }
    return entry.doc;
  }

  private cacheSet(msgId: number, doc: any): void {
    if (this.docCache.size >= DOC_CACHE_MAX) {
      const oldestKey = this.docCache.keys().next().value;
      if (oldestKey !== undefined) this.docCache.delete(oldestKey);
    }
    this.docCache.set(msgId, { doc, ts: Date.now() });
  }

  private async loadDoc(msgId: number, forceRefresh = false): Promise<any | null> {
    if (!forceRefresh) {
      const cached = this.cacheGet(msgId);
      if (cached) return cached;
    }
    const peer = await this.ensureConnected();
    const messages = await this.client!.getMessages(peer, { ids: [msgId] });
    const msg = messages?.[0];
    const doc = (msg?.media as any)?.document;
    if (!doc) return null;
    this.cacheSet(msgId, doc);
    return doc;
  }

  /**
   * Uploads a file via MTProto (8 parallel workers in embedded mode, or proxied to external NotaForge server).
   * Always sends with `forceDocument: true` to preserve 100% original quality.
   */
  public async uploadFile(
    filePath: string,
    originalName: string,
    fileSize: number,
    onProgress?: (pct: number) => void
  ): Promise<{ msgId: number; storageKey: string }> {
    const safeName = sanitizeFileName(originalName);

    if (this.mode === 'external' && this.externalServerUrl) {
      return this.uploadViaExternalServer(filePath, safeName, onProgress);
    }

    if (this.mode !== 'embedded' || !this.client) {
      throw new Error('Telegram MTProto lane is not configured');
    }

    const peer = await this.ensureConnected();
    const customFile = new CustomFile(safeName, fileSize, filePath);

    const tgFile = await this.client.uploadFile({
      file: customFile,
      workers: 8,
      onProgress: (pct: number) => {
        if (onProgress) {
          onProgress(Math.min(99, Math.max(0, Math.round(pct * 100))));
        }
      },
    });

    const message: any = await this.client.sendFile(peer, {
      file: tgFile,
      forceDocument: true,
      caption: safeName,
    });

    const msgId = Number(message?.id);
    if (!msgId || Number.isNaN(msgId)) {
      throw new Error('Telegram MTProto upload succeeded but did not return a message ID');
    }

    // Pre-populate docCache immediately if document returned
    if (message?.media?.document) {
      this.cacheSet(msgId, message.media.document);
    }

    if (onProgress) onProgress(100);
    return {
      msgId,
      storageKey: `tgmsg:${msgId}/${safeName}`,
    };
  }

  private async uploadViaExternalServer(
    filePath: string,
    safeName: string,
    onProgress?: (pct: number) => void
  ): Promise<{ msgId: number; storageKey: string }> {
    const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const sseAbort = new AbortController();

    // Subscribe to external NotaForge SSE progress stream if callback provided
    if (onProgress) {
      (async () => {
        try {
          const sseRes = await fetch(`${this.externalServerUrl}/progress/${uploadId}`, {
            signal: sseAbort.signal,
          });
          if (!sseRes.ok || !sseRes.body) return;
          const reader = sseRes.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data:')) {
                const val = parseInt(line.slice(5).trim(), 10);
                if (!Number.isNaN(val)) onProgress(Math.min(100, Math.max(0, val)));
              }
            }
          }
        } catch {
          // Ignore aborted SSE stream
        }
      })();
    }

    try {
      const fileBuf = fs.readFileSync(filePath);
      const formData = new FormData();
      formData.append('file', new Blob([fileBuf]), safeName);

      const res = await fetch(`${this.externalServerUrl}/upload?uploadId=${encodeURIComponent(uploadId)}`, {
        method: 'POST',
        body: formData,
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `External Telegram MTProto server returned HTTP ${res.status}`);
      }

      // Parse msgId from returned url `/file/<msgId>?name=...` or explicit msgId
      let msgId = Number(data.msgId || data.messageId);
      if (!msgId && typeof data.url === 'string') {
        const match = data.url.match(/\/file\/(\d+)/);
        if (match) msgId = parseInt(match[1], 10);
      }

      if (!msgId || Number.isNaN(msgId)) {
        throw new Error('External MTProto server did not return a valid message ID');
      }

      if (onProgress) onProgress(100);
      return {
        msgId,
        storageKey: `tgmsg:${msgId}/${safeName}`,
      };
    } finally {
      sseAbort.abort();
    }
  }

  /**
   * Streams a byte range [start, end] from GramJS MTProto with 512 KB chunk alignment and drain backpressure.
   */
  private async streamRange(
    doc: any,
    start: number,
    end: number,
    res: Response,
    isClosed: () => boolean
  ): Promise<void> {
    if (!this.client) throw new Error('MTProto client not initialized');

    const length = end - start + 1;
    const alignedStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE;
    const skipBytes = start - alignedStart;
    const chunks = Math.ceil((skipBytes + length) / CHUNK_SIZE);

    const fileLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: '',
    });

    let sent = 0;
    let skipped = 0;

    for await (const chunk of this.client.iterDownload({
      file: fileLocation,
      requestSize: CHUNK_SIZE,
      offset: bigInt(alignedStart),
      limit: chunks,
      dcId: doc.dcId,
    })) {
      if (isClosed() || sent >= length) break;
      let buf = Buffer.from(chunk as any);

      if (skipped < skipBytes) {
        const toSkip = Math.min(skipBytes - skipped, buf.length);
        skipped += toSkip;
        buf = buf.subarray(toSkip);
      }
      if (buf.length === 0) continue;

      const toSend = Math.min(buf.length, length - sent);
      const ok = res.write(buf.subarray(0, toSend));
      sent += toSend;

      if (!ok) {
        await new Promise<void>((resolve) => {
          const done = () => {
            res.off('drain', done);
            res.off('close', done);
            resolve();
          };
          res.once('drain', done);
          res.once('close', done);
        });
      }
    }
  }

  /**
   * Serves an MTProto document directly to an Express response with full HTTP 206 Partial Content seeking.
   */
  public async streamToResponse(
    msgId: number,
    fileName: string,
    req: Request,
    res: Response
  ): Promise<boolean> {
    if (this.mode === 'external' && this.externalServerUrl) {
      return this.proxyExternalStream(msgId, fileName, req, res);
    }

    if (this.mode !== 'embedded' || !this.client) {
      return false;
    }

    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const isClosed = () => closed;

    let doc = await this.loadDoc(msgId);
    if (!doc) return false;

    const fileSize = Number(doc.size);
    const mimeType = resolveMimeType(doc.mimeType, fileName);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(sanitizeFileName(fileName))}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    let start = 0;
    let end = fileSize - 1;
    let partial = false;
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!m || (m[1] === '' && m[2] === '')) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(416).end();
        return true;
      }

      if (m[1] === '') {
        const n = parseInt(m[2], 10);
        start = Math.max(0, fileSize - n);
      } else {
        start = parseInt(m[1], 10);
        if (m[2] !== '') {
          end = Math.min(parseInt(m[2], 10), fileSize - 1);
        } else {
          end = Math.min(fileSize - 1, start + OPEN_RANGE_CAP - 1);
        }
      }

      if (start >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(416).end();
        return true;
      }
      partial = true;
    }

    res.status(partial ? 206 : 200);
    if (partial) {
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    }
    res.setHeader('Content-Length', String(end - start + 1));

    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    try {
      await this.streamRange(doc, start, end, res, isClosed);
    } catch (err: any) {
      // Refresh expired file reference once if headers haven't been flushed with body data
      if (String(err).includes('FILE_REFERENCE') && !isClosed()) {
        this.docCache.delete(msgId);
        const refreshed = await this.loadDoc(msgId, true);
        if (refreshed) {
          await this.streamRange(refreshed, start, end, res, isClosed);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (!closed) res.end();
    return true;
  }

  private async proxyExternalStream(
    msgId: number,
    fileName: string,
    req: Request,
    res: Response
  ): Promise<boolean> {
    const targetUrl = `${this.externalServerUrl}/file/${msgId}?name=${encodeURIComponent(sanitizeFileName(fileName))}`;
    const headers: Record<string, string> = {};
    const rawRange = req.headers.range?.trim();
    if (rawRange && /^bytes=\d*-\d*$/.test(rawRange)) {
      headers.Range = rawRange;
    }

    const upstream = await fetch(targetUrl, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return false;
    }

    res.status(upstream.status);
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'cache-control'];
    for (const h of forwardHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return true;
    }

    const reader = upstream.body.getReader();
    let closed = false;
    res.on('close', () => {
      closed = true;
      reader.cancel().catch(() => {});
    });

    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        const ok = res.write(Buffer.from(value));
        if (!ok && !closed) {
          await new Promise<void>((resolve) => {
            const doneWait = () => {
              res.off('drain', doneWait);
              res.off('close', doneWait);
              resolve();
            };
            res.once('drain', doneWait);
            res.once('close', doneWait);
          });
        }
      }
    } finally {
      if (!closed) res.end();
    }
    return true;
  }

  /**
   * Downloads an MTProto document to a Buffer (used for images / AI captioning).
   */
  public async downloadToBuffer(msgId: number, fileName: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (this.mode === 'external' && this.externalServerUrl) {
      const res = await fetch(`${this.externalServerUrl}/file/${msgId}?name=${encodeURIComponent(sanitizeFileName(fileName))}`);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return {
        data: Buffer.from(arr),
        contentType: resolveMimeType(res.headers.get('content-type'), fileName),
      };
    }

    if (this.mode !== 'embedded' || !this.client) return null;

    let doc = await this.loadDoc(msgId);
    if (!doc) return null;

    const downloadDoc = async (targetDoc: any): Promise<Buffer> => {
      const fileLocation = new Api.InputDocumentFileLocation({
        id: targetDoc.id,
        accessHash: targetDoc.accessHash,
        fileReference: targetDoc.fileReference,
        thumbSize: '',
      });
      const chunks: Buffer[] = [];
      for await (const chunk of this.client!.iterDownload({
        file: fileLocation,
        requestSize: CHUNK_SIZE,
        dcId: targetDoc.dcId,
      })) {
        chunks.push(Buffer.from(chunk as any));
      }
      return Buffer.concat(chunks);
    };

    try {
      const data = await downloadDoc(doc);
      return { data, contentType: resolveMimeType(doc.mimeType, fileName) };
    } catch (err: any) {
      if (String(err).includes('FILE_REFERENCE')) {
        this.docCache.delete(msgId);
        doc = await this.loadDoc(msgId, true);
        if (!doc) return null;
        const data = await downloadDoc(doc);
        return { data, contentType: resolveMimeType(doc.mimeType, fileName) };
      }
      throw err;
    }
  }

  public async testConnection(): Promise<{
    enabled: boolean;
    mode: 'embedded' | 'external';
    ok: boolean;
    connected?: boolean;
    channelTitle?: string;
    error?: string;
  }> {
    if (this.mode === 'external' && this.externalServerUrl) {
      try {
        const res = await fetch(`${this.externalServerUrl}/ping`, { signal: AbortSignal.timeout(8000) });
        const data: any = await res.json().catch(() => ({}));
        return {
          enabled: true,
          mode: 'external',
          ok: res.ok && Boolean(data.ok),
          connected: Boolean(data.connected ?? res.ok),
          channelTitle: 'External NotaForge MTProto Server',
          error: res.ok ? undefined : `External server responded HTTP ${res.status}`,
        };
      } catch (err: any) {
        return {
          enabled: true,
          mode: 'external',
          ok: false,
          connected: false,
          error: err?.message || 'Failed to reach external MTProto server',
        };
      }
    }

    if (this.mode === 'embedded') {
      try {
        await this.ensureConnected();
        await this.client!.getMe();
        return {
          enabled: true,
          mode: 'embedded',
          ok: true,
          connected: Boolean(this.client?.connected),
          channelTitle: this.channelTitle || this.channelIdStr,
        };
      } catch (err: any) {
        return {
          enabled: true,
          mode: 'embedded',
          ok: false,
          connected: false,
          error: err?.message || 'MTProto connection failed',
        };
      }
    }

    return { enabled: false, mode: 'embedded', ok: false };
  }

  public async disconnect(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {}
    }
  }
}
