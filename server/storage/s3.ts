import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { StorageAdapter, SignedUploadUrlResult } from './types.ts';
import { isPreviewEnvironment } from '../config.ts';

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string; // Optional custom domain for Cloudflare R2 / CDN
}

/**
 * Enterprise-grade S3 adapter supporting Backblaze B2, Cloudflare R2, AWS S3, and MinIO.
 * Powered by official @aws-sdk/client-s3 with automatic endpoint normalization and path-style support.
 */
export class S3StorageAdapter implements StorageAdapter {
  private config: S3Config;
  private client: S3Client;
  private region: string;
  private endpoint: string;

  constructor(config: S3Config) {
    this.config = config;

    let reg = (config.region || '').trim();
    let ep = (config.endpoint || '').trim();

    // Ensure endpoint has protocol
    if (ep && !ep.startsWith('http://') && !ep.startsWith('https://')) {
      ep = `https://${ep}`;
    }

    // Auto-extract region from Backblaze B2 endpoint if region is empty or 'auto'
    // e.g. s3.eu-central-003.backblazeb2.com -> eu-central-003
    if ((!reg || reg === 'auto') && ep) {
      const b2Match = ep.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
      if (b2Match && b2Match[1]) {
        reg = b2Match[1];
      }
    }
    if (!reg) {
      reg = 'us-east-1';
    }

    this.region = reg;
    this.endpoint = ep || `https://${config.bucket}.s3.${reg}.amazonaws.com`;

    if (this.config.publicUrl && !this.config.publicUrl.startsWith('http://') && !this.config.publicUrl.startsWith('https://')) {
      this.config.publicUrl = `https://${this.config.publicUrl}`;
    }

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: (config.accessKeyId || '').trim(),
        secretAccessKey: (config.secretAccessKey || '').trim(),
      },
      // Backblaze B2, MinIO, and custom endpoints require path-style routing
      forcePathStyle: true,
    });
  }

  private cleanKey(key: string): string {
    return key.replace(/^\/+/, '');
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<SignedUploadUrlResult> {
    const key = this.cleanKey(storageKey);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      storageKey,
    };
  }

  async getSignedViewUrl(
    storageKey: string,
    _expiresInSeconds: number = 3600
  ): Promise<string> {
    // If publicUrl / CDN is explicitly configured, use that
    if (this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/+$/, '')}/${encodeURIComponent(this.cleanKey(storageKey))}`;
    }

    // Always route through app's proxy (/api/storage/view) to eliminate Backblaze B2 CORS and private bucket errors
    return `/api/storage/view?key=${encodeURIComponent(storageKey)}`;
  }

  async putObject(storageKey: string, data: Buffer, contentType: string): Promise<void> {
    const key = this.cleanKey(storageKey);
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      });

      await this.client.send(command);
      console.log(`✅ Successfully synced ${key} to S3/Backblaze B2 (${data.length} bytes)`);
    } catch (err: any) {
      console.error(`⚠️ S3/Backblaze putObject warning for ${key}:`, err.message || err);
      // Do not rethrow so local file storage remains safe
    }
  }

  async getObject(storageKey: string): Promise<{ data: Buffer; contentType: string } | null> {
    const key = this.cleanKey(storageKey);
    const candidates = [key];

    if (key.startsWith('uploads/')) {
      candidates.push(key.replace(/^uploads\//, ''));
    } else {
      candidates.push(`uploads/${key}`);
    }

    if (!key.startsWith('posts/') && !key.startsWith('uploads/')) {
      candidates.push(`posts/${key}`);
    }

    if (key.includes('_thumb')) {
      candidates.push(key.replace(/_thumb(\.[a-zA-Z0-9]+)$/, '$1'));
    }

    for (const candidateKey of candidates) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: candidateKey,
        });

        const response = await this.client.send(command);
        if (!response.Body) continue;

        const stream = response.Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        return {
          data: Buffer.concat(chunks),
          contentType: response.ContentType || 'image/jpeg',
        };
      } catch {}
    }

    console.warn(`⚠️ Backblaze B2 / S3 object not found for key: ${key}`);
    return null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (isPreviewEnvironment()) {
      console.log(`[Storage Protection] S3 file deletion blocked for: ${storageKey}`);
      return;
    }
    const key = this.cleanKey(storageKey);
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });
      await this.client.send(command);
      console.log(`✅ Deleted S3/Backblaze B2 object: ${key}`);
    } catch (err: any) {
      console.error(`⚠️ Failed to delete S3/Backblaze object ${key}:`, err.message || err);
    }
  }

  async listObjects(prefix: string = ''): Promise<string[]> {
    try {
      const keys: string[] = [];
      let continuationToken: string | undefined = undefined;

      do {
        const command: ListObjectsV2Command = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const res = await this.client.send(command);
        if (res.Contents) {
          for (const item of res.Contents) {
            if (item.Key && !item.Key.endsWith('/')) {
              keys.push(item.Key);
            }
          }
        }
        continuationToken = res.NextContinuationToken;
      } while (continuationToken);

      return keys;
    } catch (err: any) {
      console.error('⚠️ S3/Backblaze listObjects warning:', err.message || err);
      return [];
    }
  }

  async purgeAllObjects(): Promise<{ deleted: number }> {
    try {
      const keys = await this.listObjects('');
      if (keys.length === 0) return { deleted: 0 };

      let deletedCount = 0;
      // Delete in batches of 500 (S3 API supports up to 1000 per request)
      for (let i = 0; i < keys.length; i += 500) {
        const batch = keys.slice(i, i + 500);
        const command = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: batch.map((k) => ({ Key: this.cleanKey(k) })),
            Quiet: true,
          },
        });
        await this.client.send(command);
        deletedCount += batch.length;
      }
      console.log(`✅ [Storage Purge] Successfully deleted ${deletedCount} objects from bucket ${this.config.bucket}`);
      return { deleted: deletedCount };
    } catch (err: any) {
      console.error('⚠️ S3/Backblaze purgeAllObjects error:', err.message || err);
      throw err;
    }
  }
}
