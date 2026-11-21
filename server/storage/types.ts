import type { Request, Response } from 'express';

export interface SignedUploadUrlResult {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  publicViewUrl?: string;
  storageKey: string;
}

export interface PutObjectOptions {
  /** Optional local file path on disk (avoids reading multi-hundred-MB videos into RAM) */
  filePath?: string;
  /** Original filename to preserve in Telegram document metadata */
  fileName?: string;
  /** Exact file size in bytes */
  fileSize?: number;
  /** Optional progress callback (0-100) for server-to-cloud transfer */
  onProgress?: (pct: number) => void;
}

export interface StorageCapabilities {
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

export interface StorageConnectionTestResult {
  ok: boolean;
  summary: string;
  lanes: {
    botApi?: {
      enabled: boolean;
      ok: boolean;
      botUsername?: string;
      channelTitle?: string;
      customServer?: boolean;
      error?: string;
    };
    mtproto?: {
      enabled: boolean;
      mode: 'embedded' | 'external';
      ok: boolean;
      connected?: boolean;
      channelTitle?: string;
      error?: string;
    };
    b2Fallback?: {
      enabled: boolean;
      ok: boolean;
      objectCount?: number;
      error?: string;
    };
  };
}

export interface StorageAdapter {
  getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<SignedUploadUrlResult>;

  getSignedViewUrl(
    storageKey: string,
    expiresInSeconds?: number
  ): Promise<string>;

  deleteObject(storageKey: string): Promise<void>;

  /**
   * Uploads data to storage. May return a finalized storage key
   * (e.g. `tg:<file_id>/<name>` or `tgmsg:<msg_id>/<name>` for Telegram).
   */
  putObject(
    storageKey: string,
    data: Buffer,
    contentType: string,
    options?: PutObjectOptions
  ): Promise<string | void>;

  getObject?(
    storageKey: string
  ): Promise<{ data: Buffer; contentType: string } | null>;

  getObjectStream?(
    storageKey: string
  ): Promise<{
    stream: import('stream').Readable;
    contentType: string;
    contentLength?: number;
    resolvedKey: string;
  } | null>;

  /**
   * Streams media directly to an Express Response with full HTTP Range (206 Partial Content) support.
   * Returns true if handled, false if the object was not found.
   */
  streamToResponse?(
    storageKey: string,
    req: Request,
    res: Response
  ): Promise<boolean>;

  resolveKey?(storageKey: string): Promise<string | null>;

  listObjects?(prefix?: string): Promise<string[]>;

  purgeAllObjects?(): Promise<{ deleted: number; note?: string }>;

  getCapabilities?(): StorageCapabilities;

  testConnection?(): Promise<StorageConnectionTestResult>;

  disconnect?(): Promise<void>;
}
