import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageAdapter, SignedUploadUrlResult } from './types.ts';
import { isPreviewEnvironment } from '../config.ts';

import { isAllowedMediaName } from '../security/media.ts';

function resolveSigningSecret(): string {
  const configured = process.env.STORAGE_SIGNING_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'STORAGE_SIGNING_SECRET must be set to a random string of at least 32 characters in production.'
    );
  }
  // Dev/test: random per-process secret. Signed URLs simply stop working after a restart.
  console.warn(
    '[security] STORAGE_SIGNING_SECRET is not set (or shorter than 32 chars). Using a random temporary secret. Set it before deploying.'
  );
  return crypto.randomBytes(32).toString('hex');
}

const SIGNING_SECRET = resolveSigningSecret();

export class LocalDiskStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private appUrl: string;

  constructor(baseDir?: string, appUrl?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'uploads');
    this.appUrl = appUrl || process.env.APP_URL || '';
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private generateToken(key: string, expires: number, action: 'upload' | 'view'): string {
    const payload = `${action}:${key}:${expires}`;
    return crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  }

  public verifyToken(key: string, expires: number, action: 'upload' | 'view', token?: string): boolean {
    if (!token || typeof token !== 'string') return false;
    if (Date.now() > expires) return false;
    const expected = this.generateToken(key, expires, action);
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  }

  /** Resolve a storage key to a path inside the uploads dir. Pure: never touches the filesystem. */
  public getFilePath(storageKey: string): string {
    const safeKey = String(storageKey)
      .replace(/\0/g, '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^uploads\//, '');
    const fullPath = path.resolve(this.baseDir, safeKey);
    const rel = path.relative(this.baseDir, fullPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Invalid storage key');
    }
    return fullPath;
  }

  /** Same as getFilePath, but also creates the parent directory. Use only when writing. */
  public getFilePathForWrite(storageKey: string): string {
    const fullPath = this.getFilePath(storageKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return fullPath;
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900 // 15 mins default
  ): Promise<SignedUploadUrlResult> {
    if (!isAllowedMediaName(storageKey)) {
      throw new Error('File type not allowed');
    }
    const expires = Date.now() + expiresInSeconds * 1000;
    const token = this.generateToken(storageKey, expires, 'upload');
    const uploadUrl = `/api/storage/upload?key=${encodeURIComponent(storageKey)}&token=${token}&expires=${expires}`;

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
    expiresInSeconds: number = 3600 // 1 hour default
  ): Promise<string> {
    // If it's a data URL or external URL already, return as is
    if (storageKey.startsWith('data:') || storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
      return storageKey;
    }
    const expires = Date.now() + expiresInSeconds * 1000;
    const token = this.generateToken(storageKey, expires, 'view');
    return `/api/storage/view?key=${encodeURIComponent(storageKey)}&token=${token}&expires=${expires}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    let filePath: string;
    try {
      filePath = this.getFilePath(storageKey);
    } catch {
      return; // invalid key: nothing to delete
    }
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Failed to unlink file ${filePath}:`, err);
      }
    }
  }

  async putObject(storageKey: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = this.getFilePathForWrite(storageKey);
    fs.writeFileSync(filePath, data);
  }

  async listObjects(prefix: string = ''): Promise<string[]> {
    const targetDir = path.join(this.baseDir, prefix);
    if (!fs.existsSync(targetDir)) return [];

    const results: string[] = [];
    const scanDir = (dir: string, rel: string) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const relativePath = rel ? `${rel}/${file}` : file;
          if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath, relativePath);
          } else {
            results.push(relativePath.replace(/\\/g, '/'));
          }
        }
      } catch (e) {
        console.warn('Error reading directory:', dir, e);
      }
    };

    scanDir(targetDir, prefix);
    return results;
  }

  async purgeAllObjects(): Promise<{ deleted: number }> {
    if (!fs.existsSync(this.baseDir)) return { deleted: 0 };
    const files = await this.listObjects('');
    let deleted = 0;
    for (const f of files) {
      const p = this.getFilePath(f);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          deleted++;
        } catch {}
      }
    }
    console.log(`✅ [Local Storage Purge] Deleted ${deleted} files`);
    return { deleted };
  }
}
