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

  // In-memory bucket key index for lightning-fast, 100% resilient image resolution
  private bucketIndexLoaded = false;
  private bucketIndexPromise: Promise<void> | null = null;
  private allBucketKeys: Set<string> = new Set();
  private lowerKeyMap: Map<string, string> = new Map();
  private coreNameMap: Map<string, string[]> = new Map();
  private lastIndexTime: number = 0;

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

    // Proactively index bucket in background on initialization
    this.refreshBucketIndex().catch(() => {});
  }

  private cleanKey(key: string): string {
    return key.replace(/^\/+/, '');
  }

  private extractCoreName(key: string): string {
    const filename = key.split('/').pop() || key;
    const withoutExt = filename.replace(/\.[^/.]+$/, '');
    return withoutExt.replace(/_thumb$/, '').toLowerCase();
  }

  /**
   * Refreshes in-memory catalog of all objects in the bucket
   */
  async refreshBucketIndex(force = false): Promise<void> {
    const now = Date.now();
    if (!force && this.bucketIndexLoaded && now - this.lastIndexTime < 180000) {
      return;
    }
    if (this.bucketIndexPromise && !force) {
      return this.bucketIndexPromise;
    }

    this.bucketIndexPromise = (async () => {
      try {
        const keys = await this.listObjects('');
        this.allBucketKeys.clear();
        this.lowerKeyMap.clear();
        this.coreNameMap.clear();

        for (const k of keys) {
          const clean = this.cleanKey(k);
          this.allBucketKeys.add(clean);
          this.lowerKeyMap.set(clean.toLowerCase(), clean);

          const core = this.extractCoreName(clean);
          if (core) {
            if (!this.coreNameMap.has(core)) {
              this.coreNameMap.set(core, []);
            }
            this.coreNameMap.get(core)!.push(clean);
          }
        }

        this.bucketIndexLoaded = true;
        this.lastIndexTime = Date.now();
        console.log(`📦 [Backblaze B2 Index] Successfully cataloged ${keys.length} cloud object(s)`);
      } catch (err: any) {
        console.warn('⚠️ Could not refresh Backblaze B2 bucket index:', err.message || err);
      } finally {
        this.bucketIndexPromise = null;
      }
    })();

    return this.bucketIndexPromise;
  }

  /**
   * Intelligently resolves any requested key (full-res, thumb, cross-folder, cross-extension)
   * to its exact matching object in Backblaze B2.
   */
  async resolveKey(storageKey: string): Promise<string | null> {
    const clean = this.cleanKey(storageKey);
    await this.refreshBucketIndex();

    // 1. Direct exact match
    if (this.allBucketKeys.has(clean)) {
      return clean;
    }

    // 2. Case-insensitive exact match
    if (this.lowerKeyMap.has(clean.toLowerCase())) {
      return this.lowerKeyMap.get(clean.toLowerCase())!;
    }

    // 3. Common path prefix variations
    const prefixVariants = [
      clean,
      clean.replace(/^uploads\//, ''),
      clean.replace(/^posts\//, ''),
      `uploads/${clean}`,
      clean.startsWith('posts/') ? clean : `posts/${clean}`,
    ];

    for (const v of prefixVariants) {
      if (this.allBucketKeys.has(v)) return v;
      if (this.lowerKeyMap.has(v.toLowerCase())) return this.lowerKeyMap.get(v.toLowerCase())!;
    }

    // 4. Match by coreName (links thumbnails to full-res, handles extension differences .png vs .jpg, and cross-user paths)
    const core = this.extractCoreName(clean);
    if (core && this.coreNameMap.has(core)) {
      const matches = this.coreNameMap.get(core)!;
      const isThumbRequested = clean.includes('_thumb');

      if (isThumbRequested) {
        // If thumbnail was requested, use thumb if exists, else fall back to full resolution file
        const thumbMatch = matches.find((m) => m.includes('_thumb'));
        if (thumbMatch) return thumbMatch;
        return matches[0];
      } else {
        // If full-res requested, prefer non-thumb file, else thumb file
        const fullMatch = matches.find((m) => !m.includes('_thumb'));
        if (fullMatch) return fullMatch;
        return matches[0];
      }
    }

    // 5. Match by filename alone anywhere in the bucket
    const reqFilename = clean.split('/').pop()?.toLowerCase();
    if (reqFilename) {
      for (const k of this.allBucketKeys) {
        const kFilename = k.split('/').pop()?.toLowerCase();
        if (kFilename === reqFilename) {
          return k;
        }
      }
    }

    return null;
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
    if (this.config.publicUrl) {
      const resolved = (await this.resolveKey(storageKey)) || this.cleanKey(storageKey);
      return `${this.config.publicUrl.replace(/\/+$/, '')}/${encodeURIComponent(resolved)}`;
    }

    // Always route through /api/storage/view to ensure streaming cache, CORS, and fallback support
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

      // Add to local catalog immediately
      this.allBucketKeys.add(key);
      this.lowerKeyMap.set(key.toLowerCase(), key);
      const core = this.extractCoreName(key);
      if (core) {
        if (!this.coreNameMap.has(core)) this.coreNameMap.set(core, []);
        this.coreNameMap.get(core)!.push(key);
      }
    } catch (err: any) {
      console.error(`⚠️ S3/Backblaze putObject warning for ${key}:`, err.message || err);
    }
  }

  /**
   * Streams an object directly from Backblaze B2 without memory buffering
   */
  async getObjectStream(
    storageKey: string
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
    resolvedKey: string;
  } | null> {
    const resolvedKey = (await this.resolveKey(storageKey)) || this.cleanKey(storageKey);
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: resolvedKey,
      });

      const response = await this.client.send(command);
      if (!response.Body) return null;

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'image/jpeg',
        contentLength: response.ContentLength,
        resolvedKey,
      };
    } catch (err: any) {
      console.warn(`⚠️ Backblaze B2 getObjectStream failed for [${resolvedKey}]:`, err.message || err);
      return null;
    }
  }

  async getObject(storageKey: string): Promise<{ data: Buffer; contentType: string } | null> {
    const streamObj = await this.getObjectStream(storageKey);
    if (!streamObj) return null;

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of streamObj.stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return {
        data: Buffer.concat(chunks),
        contentType: streamObj.contentType,
      };
    } catch (err: any) {
      console.warn(`⚠️ Error reading stream for [${storageKey}]:`, err.message || err);
      return null;
    }
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
