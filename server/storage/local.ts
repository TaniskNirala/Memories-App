import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageAdapter, SignedUploadUrlResult } from './types.ts';

const SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || 'kinfolk-local-secret-key-32chars!!';

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

  public verifyToken(key: string, expires: number, action: 'upload' | 'view', token: string): boolean {
    if (Date.now() > expires) return false;
    const expected = this.generateToken(key, expires, action);
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }

  public getFilePath(storageKey: string): string {
    // Sanitize key to prevent path traversal
    const safeKey = storageKey.replace(/\.\./g, '').replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.baseDir, safeKey);
    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fullPath;
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900 // 15 mins default
  ): Promise<SignedUploadUrlResult> {
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
    const filePath = this.getFilePath(storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async putObject(storageKey: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = this.getFilePath(storageKey);
    fs.writeFileSync(filePath, data);
  }
}
