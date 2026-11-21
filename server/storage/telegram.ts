import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
import {
  StorageAdapter,
  SignedUploadUrlResult,
  PutObjectOptions,
  StorageCapabilities,
  StorageConnectionTestResult,
} from './types.ts';
import {
  TelegramMtprotoClient,
  resolveMimeType,
  sanitizeFileName,
  parseTelegramServerUrl,
} from './telegram-mtproto.ts';

const OFFICIAL_BOT_API_BASE = 'https://api.telegram.org';
const BOT_API_LANE_THRESHOLD = 15 * 1024 * 1024; // 15 MB (NotaForge dual-lane split, safely below 20 MB getFile limit)
const OFFICIAL_BOT_API_MAX = 20 * 1024 * 1024; // 20 MB official Telegram getFile ceiling
const MTPROTO_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const FILE_PATH_CACHE_TTL_MS = 45 * 60 * 1000; // 45 mins (Telegram file_path stays valid ~1 hour)
const LOCAL_CACHE_MAX_SIZE = 15 * 1024 * 1024; // Cache images/files <= 15 MB on local disk

export interface TelegramStorageConfig {
  botToken?: string;
  chatId?: string;
  botApiBaseUrl?: string;
  apiId?: number;
  apiHash?: string;
  session?: string;
  mtprotoServerUrl?: string;
  cacheDir?: string;
}

export function isTelegramKey(storageKey: string): boolean {
  const k = (storageKey || '').trim().replace(/^\/+/, '');
  return k.startsWith('tg:') || k.startsWith('tgmsg:');
}

export function parseTelegramKey(
  storageKey: string
): { lane: 'bot'; fileId: string; fileName: string } | { lane: 'mtproto'; msgId: number; fileName: string } | null {
  const clean = (storageKey || '').trim().replace(/^\/+/, '');
  if (clean.startsWith('tg:')) {
    const rest = clean.slice(3);
    const slashIdx = rest.indexOf('/');
    const fileId = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const fileName = slashIdx >= 0 ? rest.slice(slashIdx + 1) : 'file.bin';
    if (!fileId) return null;
    return { lane: 'bot', fileId, fileName: sanitizeFileName(fileName) };
  }
  if (clean.startsWith('tgmsg:')) {
    const rest = clean.slice(6);
    const slashIdx = rest.indexOf('/');
    const msgIdStr = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const msgId = parseInt(msgIdStr, 10);
    const fileName = slashIdx >= 0 ? rest.slice(slashIdx + 1) : 'file.bin';
    if (!msgId || Number.isNaN(msgId)) return null;
    return { lane: 'mtproto', msgId, fileName: sanitizeFileName(fileName) };
  }
  return null;
}

/**
 * NotaForge Dual-Lane Telegram Storage Adapter:
 * - Lane 1 (Bot API): Fast uncompressed `sendDocument` for files <= 15 MB with 429 retry queue & Range forwarding.
 * - Lane 2 (MTProto): GramJS (embedded or external NotaForge server) for files > 15 MB up to 2 GB with 8-worker uploads & HTTP 206 streaming.
 * - Archive-on-Delete: Deleting in Kinfolk clears local cache while keeping Telegram channel messages intact as a permanent backup archive.
 */
export class TelegramStorageAdapter implements StorageAdapter {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly botApiBase: string;
  private readonly isCustomBotApi: boolean;
  private readonly cacheDir: string;
  private readonly mtproto: TelegramMtprotoClient;

  // 45-min in-memory cache of Telegram Bot API file_path lookups
  private filePathCache: Map<string, { filePath: string; expiresAt: number }> = new Map();

  // Serialized upload queue to smoothly pace Bot API sendDocument bursts & respect 429 retry_after
  private botUploadChain: Promise<any> = Promise.resolve();

  constructor(config: TelegramStorageConfig) {
    this.botToken = (config.botToken || '').trim();
    this.chatId = (config.chatId || '').trim();

    const parsedBase = parseTelegramServerUrl(config.botApiBaseUrl);
    this.botApiBase = parsedBase || OFFICIAL_BOT_API_BASE;
    this.isCustomBotApi = Boolean(parsedBase && parsedBase !== OFFICIAL_BOT_API_BASE);

    this.cacheDir = path.resolve(config.cacheDir || path.join(process.cwd(), 'uploads', 'tg-cache'));
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.mtproto = new TelegramMtprotoClient({
      apiId: config.apiId,
      apiHash: config.apiHash,
      session: config.session,
      chatId: this.chatId,
      externalServerUrl: config.mtprotoServerUrl,
    });
  }

  public hasBotApi(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  public hasMtproto(): boolean {
    return this.mtproto.isEnabled();
  }

  private redactSecret(msg: string): string {
    if (!this.botToken) return msg;
    return msg.split(this.botToken).join('[REDACTED_BOT_TOKEN]');
  }

  /**
   * Computes a deterministic, strictly confined local disk cache path for a Telegram key.
   */
  public getLocalCachePath(storageKey: string): string {
    const parsed = parseTelegramKey(storageKey);
    const ext = parsed ? path.extname(parsed.fileName).toLowerCase() : '.bin';
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
    const hash = crypto.createHash('sha256').update(storageKey).digest('hex');
    const resolved = path.resolve(this.cacheDir, `${hash}${safeExt}`);
    if (!resolved.startsWith(this.cacheDir + path.sep)) {
      throw new Error('Invalid Telegram cache path');
    }
    return resolved;
  }

  public saveToLocalCache(storageKey: string, data: Buffer): void {
    try {
      if (data.length > LOCAL_CACHE_MAX_SIZE) return;
      const target = this.getLocalCachePath(storageKey);
      fs.writeFileSync(target, data);
    } catch {}
  }

  public copyFileToLocalCache(storageKey: string, sourceFilePath: string, fileSize?: number): void {
    try {
      if (fileSize !== undefined && fileSize > LOCAL_CACHE_MAX_SIZE) return;
      if (!fs.existsSync(sourceFilePath)) return;
      const stat = fs.statSync(sourceFilePath);
      if (stat.size > LOCAL_CACHE_MAX_SIZE) return;
      const target = this.getLocalCachePath(storageKey);
      fs.copyFileSync(sourceFilePath, target);
    } catch {}
  }

  public getCapabilities(): StorageCapabilities {
    const botApiEnabled = this.hasBotApi();
    const mtprotoEnabled = this.hasMtproto();
    const mtprotoMode = this.mtproto.getMode();

    let mode = 'Telegram Cloud';
    if (botApiEnabled && mtprotoEnabled) mode = 'Telegram Dual-Lane (Bot API + MTProto)';
    else if (mtprotoEnabled) mode = mtprotoMode === 'external' ? 'Telegram MTProto (External Server)' : 'Telegram MTProto (Embedded)';
    else if (botApiEnabled) mode = this.isCustomBotApi ? 'Telegram Bot API (Custom Server)' : 'Telegram Bot API';

    const maxFileSizeBytes = mtprotoEnabled || this.isCustomBotApi ? MTPROTO_MAX_BYTES : OFFICIAL_BOT_API_MAX;
    const maxFileSizeLabel = maxFileSizeBytes >= 1024 * 1024 * 1024 ? '2 GB' : '20 MB';

    return {
      backend: 'telegram',
      mode,
      maxFileSizeBytes,
      maxFileSizeLabel,
      botApiEnabled,
      mtprotoEnabled,
      mtprotoMode,
      customBotApiUrl: this.isCustomBotApi,
      b2FallbackEnabled: false,
      archiveOnDelete: true,
      mtprotoConnected: mtprotoEnabled ? this.mtproto.isConnected() : undefined,
      channelTitle: this.mtproto.getChannelTitle(),
    };
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string
  ): Promise<SignedUploadUrlResult> {
    // Uploads always go through Kinfolk's authenticated multipart endpoint so credentials stay server-side
    return {
      uploadUrl: '/api/posts/upload-file',
      method: 'POST',
      headers: { 'Content-Type': contentType },
      storageKey,
    };
  }

  async getSignedViewUrl(storageKey: string): Promise<string> {
    // Always proxy through /api/storage/view so Telegram bot tokens and MTProto sessions never reach browsers
    return `/api/storage/view?key=${encodeURIComponent(storageKey)}`;
  }

  /**
   * Archive-on-delete: clears local cache copy while intentionally keeping the Telegram channel message intact.
   */
  async deleteObject(storageKey: string): Promise<void> {
    if (!isTelegramKey(storageKey)) return;
    try {
      const cached = this.getLocalCachePath(storageKey);
      if (fs.existsSync(cached)) {
        fs.unlinkSync(cached);
      }
    } catch {}
    console.log(`🗄️ [Telegram Archive] Removed app reference for ${storageKey}; original document kept archived in Telegram channel.`);
  }

  /**
   * Uploads an uncompressed Document to Telegram via the optimal lane:
   * - Files > 15 MB (or when Bot API isn't configured): MTProto lane (up to 2 GB, 8 parallel workers)
   * - Files <= 15 MB (when Bot API is configured): Bot API lane (fast sendDocument + 429 retry)
   */
  async putObject(
    storageKey: string,
    data: Buffer,
    contentType: string,
    options?: PutObjectOptions
  ): Promise<string> {
    const safeName = sanitizeFileName(options?.fileName || path.basename(storageKey));
    const fileSize = options?.fileSize ?? data.length;
    const filePath = options?.filePath;

    const useMtproto =
      this.hasMtproto() &&
      (!this.hasBotApi() || (!this.isCustomBotApi && fileSize > BOT_API_LANE_THRESHOLD));

    if (useMtproto) {
      let tempPathToClean: string | null = null;
      let targetDiskPath = filePath;
      if (!targetDiskPath || !fs.existsSync(targetDiskPath)) {
        tempPathToClean = path.join(this.cacheDir, `tmp_${Date.now()}_${crypto.randomUUID()}_${safeName}`);
        fs.writeFileSync(tempPathToClean, data);
        targetDiskPath = tempPathToClean;
      }

      try {
        const result = await this.mtproto.uploadFile(targetDiskPath, safeName, fileSize, options?.onProgress);
        if (fileSize <= LOCAL_CACHE_MAX_SIZE) {
          this.copyFileToLocalCache(result.storageKey, targetDiskPath, fileSize);
        }
        return result.storageKey;
      } finally {
        if (tempPathToClean) {
          fs.unlink(tempPathToClean, () => {});
        }
      }
    }

    if (!this.hasBotApi()) {
      throw new Error(
        'Telegram storage is not configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID or MTProto credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_CHAT_ID).'
      );
    }

    if (!this.isCustomBotApi && fileSize > OFFICIAL_BOT_API_MAX) {
      throw new Error(
        `File "${safeName}" (${(fileSize / (1024 * 1024)).toFixed(1)} MB) exceeds Telegram Bot API's 20 MB download limit. Configure MTProto (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION) or a custom TELEGRAM_API_BASE_URL for files up to 2 GB.`
      );
    }

    const bufferToSend = data.length > 0 ? data : filePath ? fs.readFileSync(filePath) : Buffer.alloc(0);
    const finalKey = await this.enqueueBotUpload(bufferToSend, safeName, contentType, options?.onProgress);
    this.saveToLocalCache(finalKey, bufferToSend);
    return finalKey;
  }

  /**
   * Serializes Bot API sendDocument uploads to avoid burst flood limits and retries HTTP 429 cleanly.
   */
  private enqueueBotUpload(
    data: Buffer,
    fileName: string,
    contentType: string,
    onProgress?: (pct: number) => void
  ): Promise<string> {
    const task = this.botUploadChain.then(() => this.sendDocumentViaBotApi(data, fileName, contentType, onProgress));
    // Ensure chain continues even if one upload fails
    this.botUploadChain = task.catch(() => {});
    return task;
  }

  private async sendDocumentViaBotApi(
    data: Buffer,
    fileName: string,
    contentType: string,
    onProgress?: (pct: number) => void
  ): Promise<string> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (onProgress) onProgress(attempt === 1 ? 35 : 50);

        const formData = new FormData();
        formData.append('chat_id', this.chatId);
        formData.append('disable_content_type_detection', 'true');
        formData.append('caption', fileName);
        formData.append('document', new Blob([new Uint8Array(data)], { type: contentType || 'application/octet-stream' }), fileName);

        const res = await fetch(`${this.botApiBase}/bot${this.botToken}/sendDocument`, {
          method: 'POST',
          body: formData,
        });

        const json: any = await res.json().catch(() => ({}));

        if (res.status === 429 || json?.error_code === 429) {
          const retryAfterSec = Number(json?.parameters?.retry_after) || 3;
          console.warn(`⏳ [Telegram Bot API] Rate limit hit; waiting ${retryAfterSec}s before retry (${attempt}/${maxAttempts})...`);
          await new Promise((r) => setTimeout(r, (retryAfterSec + 0.5) * 1000));
          continue;
        }

        if (!res.ok || !json?.ok) {
          const desc = this.redactSecret(json?.description || `HTTP ${res.status}`);
          throw new Error(`Telegram sendDocument failed: ${desc}`);
        }

        const doc = json.result?.document || json.result?.video || json.result?.audio || json.result?.photo?.slice(-1)?.[0];
        const fileId: string | undefined = doc?.file_id;
        if (!fileId) {
          throw new Error('Telegram sendDocument succeeded but did not return a file_id');
        }

        if (onProgress) onProgress(100);
        return `tg:${fileId}/${fileName}`;
      } catch (err: any) {
        if (attempt >= maxAttempts) {
          throw new Error(this.redactSecret(err?.message || String(err)));
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }

    throw new Error('Telegram upload failed after retries');
  }

  private async resolveBotFilePath(fileId: string, forceRefresh = false): Promise<string | null> {
    if (!this.botToken) return null;

    if (!forceRefresh) {
      const cached = this.filePathCache.get(fileId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.filePath;
      }
    }

    const res = await fetch(`${this.botApiBase}/bot${this.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok || !json?.result?.file_path) {
      console.warn('⚠️ [Telegram Bot API] getFile failed:', this.redactSecret(json?.description || `HTTP ${res.status}`));
      return null;
    }

    const filePath = String(json.result.file_path);
    this.filePathCache.set(fileId, {
      filePath,
      expiresAt: Date.now() + FILE_PATH_CACHE_TTL_MS,
    });
    return filePath;
  }

  /**
   * Streams a local file with full HTTP 206 Partial Content Range support.
   */
  private streamLocalFileWithRange(
    diskPath: string,
    fileName: string,
    req: Request,
    res: Response
  ): boolean {
    if (!fs.existsSync(diskPath)) return false;
    const stat = fs.statSync(diskPath);
    const fileSize = stat.size;
    const mimeType = resolveMimeType(null, fileName);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(sanitizeFileName(fileName))}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!m || (m[1] === '' && m[2] === '')) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(416).end();
        return true;
      }
      let start = 0;
      let end = fileSize - 1;
      if (m[1] === '') {
        start = Math.max(0, fileSize - parseInt(m[2], 10));
      } else {
        start = parseInt(m[1], 10);
        if (m[2] !== '') end = Math.min(parseInt(m[2], 10), fileSize - 1);
      }
      if (start >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(416).end();
        return true;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(diskPath, { start, end }).pipe(res);
      return true;
    }

    res.status(200);
    res.setHeader('Content-Length', String(fileSize));
    fs.createReadStream(diskPath).pipe(res);
    return true;
  }

  /**
   * Streams any Telegram key (`tg:` or `tgmsg:`) directly to an Express response with full Range/206 support and local caching.
   */
  async streamToResponse(storageKey: string, req: Request, res: Response): Promise<boolean> {
    const parsed = parseTelegramKey(storageKey);
    if (!parsed) return false;

    // 1. Check local disk cache first for instant repeat delivery
    try {
      const cachePath = this.getLocalCachePath(storageKey);
      if (fs.existsSync(cachePath)) {
        return this.streamLocalFileWithRange(cachePath, parsed.fileName, req, res);
      }
    } catch {}

    // 2. MTProto lane (`tgmsg:<msgId>/<fileName>`)
    if (parsed.lane === 'mtproto') {
      return this.mtproto.streamToResponse(parsed.msgId, parsed.fileName, req, res);
    }

    // 3. Bot API lane (`tg:<fileId>/<fileName>`)
    let filePath = await this.resolveBotFilePath(parsed.fileId);
    if (!filePath) return false;

    // Support co-located self-hosted Local Bot API Server (`--local` returns an absolute path on disk)
    if (this.isCustomBotApi && path.isAbsolute(filePath) && fs.existsSync(filePath)) {
      return this.streamLocalFileWithRange(filePath, parsed.fileName, req, res);
    }

    const fetchUpstream = async (tgFilePath: string) => {
      const normalizedPath = tgFilePath.replace(/^\/+/, '');
      const downloadUrl = `${this.botApiBase}/file/bot${this.botToken}/${normalizedPath}`;
      const rawRange = req.headers.range?.trim();
      const safeRange = rawRange && /^bytes=\d*-\d*$/.test(rawRange) ? rawRange : undefined;
      return fetch(downloadUrl, safeRange ? { headers: { Range: safeRange } } : undefined);
    };

    let fileRes = await fetchUpstream(filePath);
    if (fileRes.status === 404) {
      // Cached file_path may have expired (>1h); refresh once and retry
      filePath = await this.resolveBotFilePath(parsed.fileId, true);
      if (!filePath) return false;
      fileRes = await fetchUpstream(filePath);
    }

    if (!fileRes.ok && fileRes.status !== 206) {
      console.warn('⚠️ [Telegram Bot API] File download failed with status:', fileRes.status);
      return false;
    }

    const contentType = resolveMimeType(fileRes.headers.get('content-type'), parsed.fileName);
    const contentLengthHeader = fileRes.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    res.status(fileRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(parsed.fileName)}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', fileRes.headers.get('accept-ranges') || 'bytes');
    if (contentLengthHeader) res.setHeader('Content-Length', contentLengthHeader);
    const contentRange = fileRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (!fileRes.body) {
      res.end();
      return true;
    }

    // Cache full non-range responses <= 15 MB to local disk while streaming to browser
    const shouldCache = fileRes.status === 200 && !req.headers.range && (!contentLength || contentLength <= LOCAL_CACHE_MAX_SIZE);
    let cacheChunks: Buffer[] | null = shouldCache ? [] : null;
    let totalBytes = 0;

    const reader = fileRes.body.getReader();
    let closed = false;
    res.on('close', () => {
      closed = true;
      reader.cancel().catch(() => {});
    });

    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        totalBytes += buf.length;
        if (cacheChunks) {
          if (totalBytes <= LOCAL_CACHE_MAX_SIZE) {
            cacheChunks.push(buf);
          } else {
            cacheChunks = null;
          }
        }
        const ok = res.write(buf);
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

      if (cacheChunks && !closed && totalBytes > 0) {
        this.saveToLocalCache(storageKey, Buffer.concat(cacheChunks));
      }
    } finally {
      if (!closed) res.end();
    }

    return true;
  }

  async getObject(storageKey: string): Promise<{ data: Buffer; contentType: string } | null> {
    const parsed = parseTelegramKey(storageKey);
    if (!parsed) return null;

    // 1. Check local cache
    try {
      const cachePath = this.getLocalCachePath(storageKey);
      if (fs.existsSync(cachePath)) {
        return {
          data: fs.readFileSync(cachePath),
          contentType: resolveMimeType(null, parsed.fileName),
        };
      }
    } catch {}

    // 2. MTProto lane
    if (parsed.lane === 'mtproto') {
      const obj = await this.mtproto.downloadToBuffer(parsed.msgId, parsed.fileName);
      if (obj) this.saveToLocalCache(storageKey, obj.data);
      return obj;
    }

    // 3. Bot API lane
    const filePath = await this.resolveBotFilePath(parsed.fileId);
    if (!filePath) return null;

    if (this.isCustomBotApi && path.isAbsolute(filePath) && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      return { data, contentType: resolveMimeType(null, parsed.fileName) };
    }

    const res = await fetch(`${this.botApiBase}/file/bot${this.botToken}/${filePath.replace(/^\/+/, '')}`);
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    this.saveToLocalCache(storageKey, data);
    return {
      data,
      contentType: resolveMimeType(res.headers.get('content-type'), parsed.fileName),
    };
  }

  async getObjectStream(
    storageKey: string
  ): Promise<{ stream: Readable; contentType: string; contentLength?: number; resolvedKey: string } | null> {
    const obj = await this.getObject(storageKey);
    if (!obj) return null;
    return {
      stream: Readable.from(obj.data),
      contentType: obj.contentType,
      contentLength: obj.data.length,
      resolvedKey: storageKey,
    };
  }

  async purgeAllObjects(): Promise<{ deleted: number; note?: string }> {
    // Archive-on-delete: never purge messages from the Telegram channel
    let clearedCache = 0;
    try {
      if (fs.existsSync(this.cacheDir)) {
        for (const f of fs.readdirSync(this.cacheDir)) {
          const full = path.resolve(this.cacheDir, f);
          if (full.startsWith(this.cacheDir + path.sep) && fs.statSync(full).isFile()) {
            fs.unlinkSync(full);
            clearedCache++;
          }
        }
      }
    } catch {}
    return {
      deleted: clearedCache,
      note: 'Telegram channel messages are preserved as a permanent backup archive; only local disk cache was cleared.',
    };
  }

  async testConnection(): Promise<StorageConnectionTestResult> {
    const lanes: StorageConnectionTestResult['lanes'] = {};
    let anyEnabled = false;
    let allEnabledOk = true;

    if (this.hasBotApi()) {
      anyEnabled = true;
      try {
        const meRes = await fetch(`${this.botApiBase}/bot${this.botToken}/getMe`, { signal: AbortSignal.timeout(8000) });
        const meJson: any = await meRes.json().catch(() => ({}));
        if (!meRes.ok || !meJson?.ok) {
          throw new Error(this.redactSecret(meJson?.description || `getMe failed (HTTP ${meRes.status})`));
        }

        const chatRes = await fetch(
          `${this.botApiBase}/bot${this.botToken}/getChat?chat_id=${encodeURIComponent(this.chatId)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const chatJson: any = await chatRes.json().catch(() => ({}));
        if (!chatRes.ok || !chatJson?.ok) {
          throw new Error(this.redactSecret(chatJson?.description || `getChat failed (HTTP ${chatRes.status})`));
        }

        lanes.botApi = {
          enabled: true,
          ok: true,
          botUsername: meJson.result?.username ? `@${meJson.result.username}` : 'Connected Bot',
          channelTitle: chatJson.result?.title || chatJson.result?.username || this.chatId,
          customServer: this.isCustomBotApi,
        };
      } catch (err: any) {
        allEnabledOk = false;
        lanes.botApi = {
          enabled: true,
          ok: false,
          customServer: this.isCustomBotApi,
          error: this.redactSecret(err?.message || 'Bot API check failed'),
        };
      }
    }

    if (this.hasMtproto()) {
      anyEnabled = true;
      const mtTest = await this.mtproto.testConnection();
      lanes.mtproto = mtTest;
      if (!mtTest.ok) allEnabledOk = false;
    }

    const ok = anyEnabled && allEnabledOk;
    let summary = 'Telegram storage is not configured yet.';
    if (anyEnabled) {
      if (ok) {
        const parts: string[] = [];
        if (lanes.botApi?.ok) parts.push(`Bot API (${lanes.botApi.botUsername})`);
        if (lanes.mtproto?.ok) parts.push(`MTProto (${lanes.mtproto.channelTitle || lanes.mtproto.mode})`);
        summary = `Connected to Telegram Cloud via ${parts.join(' + ')}.`;
      } else {
        const errors: string[] = [];
        if (lanes.botApi && !lanes.botApi.ok) errors.push(`Bot API: ${lanes.botApi.error}`);
        if (lanes.mtproto && !lanes.mtproto.ok) errors.push(`MTProto: ${lanes.mtproto.error}`);
        summary = `Telegram connection issue — ${errors.join('; ')}`;
      }
    }

    return { ok, summary, lanes };
  }

  async disconnect(): Promise<void> {
    await this.mtproto.disconnect();
  }
}
