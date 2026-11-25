import type { Request, Response } from 'express';
import {
  StorageAdapter,
  SignedUploadUrlResult,
  PutObjectOptions,
  StorageCapabilities,
  StorageConnectionTestResult,
  TelegramExistence,
} from './types.ts';
import { TelegramStorageAdapter, isTelegramKey } from './telegram.ts';
import { S3StorageAdapter } from './s3.ts';

/**
 * Hybrid Storage Router:
 * - All new writes go to Telegram (Bot API <= 15 MB + MTProto > 15 MB up to 2 GB).
 * - Reads for `tg:` and `tgmsg:` route to Telegram.
 * - Reads for legacy keys (`posts/...`) transparently fall back to Backblaze B2 / S3 if configured.
 * - Deletes for Telegram keys preserve the Telegram channel message as a permanent backup archive.
 */
export class HybridTelegramB2Adapter implements StorageAdapter {
  private readonly telegram: TelegramStorageAdapter;
  private readonly b2Fallback: S3StorageAdapter | null;

  constructor(telegram: TelegramStorageAdapter, b2Fallback: S3StorageAdapter | null = null) {
    this.telegram = telegram;
    this.b2Fallback = b2Fallback;
  }

  getCapabilities(): StorageCapabilities {
    const base = this.telegram.getCapabilities();
    return {
      ...base,
      b2FallbackEnabled: Boolean(this.b2Fallback),
    };
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<SignedUploadUrlResult> {
    return this.telegram.getSignedUploadUrl(storageKey, contentType);
  }

  async getSignedViewUrl(storageKey: string, expiresInSeconds?: number): Promise<string> {
    if (isTelegramKey(storageKey)) {
      return this.telegram.getSignedViewUrl(storageKey);
    }
    if (this.b2Fallback) {
      return this.b2Fallback.getSignedViewUrl(storageKey, expiresInSeconds);
    }
    return `/api/storage/view?key=${encodeURIComponent(storageKey)}`;
  }

  async putObject(
    storageKey: string,
    data: Buffer,
    contentType: string,
    options?: PutObjectOptions
  ): Promise<string> {
    return this.telegram.putObject(storageKey, data, contentType, options);
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (isTelegramKey(storageKey)) {
      // Archive-on-delete: preserve message in Telegram channel
      await this.telegram.deleteObject(storageKey);
      return;
    }
    if (this.b2Fallback) {
      await this.b2Fallback.deleteObject(storageKey);
    }
  }

  async streamToResponse(storageKey: string, req: Request, res: Response): Promise<boolean> {
    if (isTelegramKey(storageKey)) {
      return this.telegram.streamToResponse(storageKey, req, res);
    }
    return false;
  }

  async getObject(storageKey: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (isTelegramKey(storageKey)) {
      return this.telegram.getObject(storageKey);
    }
    if (this.b2Fallback) {
      return this.b2Fallback.getObject(storageKey);
    }
    return null;
  }

  async getObjectStream(
    storageKey: string
  ): Promise<{ stream: import('stream').Readable; contentType: string; contentLength?: number; resolvedKey: string } | null> {
    if (isTelegramKey(storageKey)) {
      return this.telegram.getObjectStream(storageKey);
    }
    if (this.b2Fallback) {
      return this.b2Fallback.getObjectStream(storageKey);
    }
    return null;
  }

  async resolveKey(storageKey: string): Promise<string | null> {
    if (isTelegramKey(storageKey)) {
      return storageKey;
    }
    if (this.b2Fallback) {
      return this.b2Fallback.resolveKey(storageKey);
    }
    return null;
  }

  async checkTelegramExistence(storageKeys: string[]): Promise<Record<string, TelegramExistence>> {
    return this.telegram.checkTelegramExistence(storageKeys);
  }

  async listObjects(prefix?: string): Promise<string[]> {
    // Only legacy B2 bucket supports listing; Telegram channels are archive-only
    if (this.b2Fallback) {
      return this.b2Fallback.listObjects(prefix);
    }
    return [];
  }

  async purgeAllObjects(): Promise<{ deleted: number; note?: string }> {
    // Preserve Telegram channel messages AND legacy B2 fallback files unless explicitly in B2-only mode
    return this.telegram.purgeAllObjects();
  }

  async testConnection(): Promise<StorageConnectionTestResult> {
    const result = await this.telegram.testConnection();

    if (this.b2Fallback) {
      try {
        const keys = await this.b2Fallback.listObjects('');
        result.lanes.b2Fallback = {
          enabled: true,
          ok: true,
          objectCount: keys.length,
        };
      } catch (err: any) {
        result.lanes.b2Fallback = {
          enabled: true,
          ok: false,
          error: err?.message || 'Could not list Backblaze B2 fallback bucket',
        };
      }
    } else {
      result.lanes.b2Fallback = {
        enabled: false,
        ok: true,
      };
    }

    return result;
  }

  async disconnect(): Promise<void> {
    await this.telegram.disconnect();
  }
}
