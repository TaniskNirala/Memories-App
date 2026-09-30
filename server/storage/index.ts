import { StorageAdapter } from './types.ts';
import { LocalDiskStorageAdapter } from './local.ts';
import { S3StorageAdapter, S3Config } from './s3.ts';

let adapterInstance: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapterInstance) return adapterInstance;

  const backend = process.env.STORAGE_BACKEND || 'local';

  if (backend === 's3' || backend === 'r2') {
    const config: S3Config = {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      publicUrl: process.env.S3_PUBLIC_URL,
    };
    adapterInstance = new S3StorageAdapter(config);
  } else {
    adapterInstance = new LocalDiskStorageAdapter();
  }

  return adapterInstance;
}

export * from './types.ts';
export * from './local.ts';
export * from './s3.ts';
