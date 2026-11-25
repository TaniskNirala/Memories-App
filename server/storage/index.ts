import { StorageAdapter, StorageCapabilities } from './types.ts';
import { LocalDiskStorageAdapter } from './local.ts';
import { S3StorageAdapter, S3Config } from './s3.ts';
import { TelegramStorageAdapter } from './telegram.ts';
import { HybridTelegramB2Adapter } from './hybrid.ts';

let adapterInstance: StorageAdapter | null = null;

function readTelegramEnv() {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.CHANNEL_ID ||
    ''
  ).trim();
  const apiIdRaw = (process.env.TELEGRAM_API_ID || process.env.API_ID || '').trim();
  const apiHash = (process.env.TELEGRAM_API_HASH || process.env.API_HASH || '').trim();
  const session = (
    process.env.TELEGRAM_SESSION ||
    process.env.TELEGRAM_STRING_SESSION ||
    process.env.STRING_SESSION ||
    ''
  ).trim();
  const botApiBaseUrl = (process.env.TELEGRAM_API_BASE_URL || '').trim();
  const mtprotoServerUrl = (process.env.TELEGRAM_MTPROTO_SERVER_URL || '').trim();

  return {
    botToken,
    chatId,
    apiId: apiIdRaw ? parseInt(apiIdRaw, 10) : undefined,
    apiHash,
    session,
    botApiBaseUrl,
    mtprotoServerUrl,
  };
}

function hasTelegramCredentials(): boolean {
  const env = readTelegramEnv();
  const hasChat = Boolean(env.chatId);
  const hasBot = Boolean(env.botToken && hasChat);
  const hasEmbeddedMtproto = Boolean(env.apiId && env.apiHash && env.session && hasChat);
  const hasExternalMtproto = Boolean(env.mtprotoServerUrl);
  return hasBot || hasEmbeddedMtproto || hasExternalMtproto;
}

function createS3FallbackAdapter(): S3StorageAdapter | null {
  const bucket = process.env.S3_BUCKET || process.env.B2_BUCKET || process.env.B2_BUCKET_NAME || '';
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ||
    process.env.B2_ACCESS_KEY_ID ||
    process.env.B2_APPLICATION_KEY_ID ||
    process.env.B2_KEY_ID ||
    '';
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.B2_SECRET_ACCESS_KEY ||
    process.env.B2_APPLICATION_KEY ||
    '';

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const config: S3Config = {
    endpoint: process.env.S3_ENDPOINT || process.env.B2_ENDPOINT,
    region: process.env.S3_REGION || process.env.B2_REGION || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl: process.env.S3_PUBLIC_URL || process.env.B2_PUBLIC_URL,
  };
  return new S3StorageAdapter(config);
}

export function isCloudStorageBackend(): boolean {
  const backend = (process.env.STORAGE_BACKEND || '').toLowerCase().trim();
  if (backend === 'local') return false;
  if (backend === 'telegram' || backend === 'tg') return true;
  if (backend === 's3' || backend === 'r2' || backend === 'b2' || backend === 'backblaze') return true;
  if (hasTelegramCredentials()) return true;
  return Boolean(process.env.S3_BUCKET || process.env.B2_BUCKET || process.env.B2_BUCKET_NAME);
}

export function getStorageCapabilities(): StorageCapabilities {
  const adapter = getStorageAdapter();
  if (adapter.getCapabilities) {
    return adapter.getCapabilities();
  }
  const backend = (process.env.STORAGE_BACKEND || 'local').toLowerCase().trim();
  const isS3 =
    backend === 's3' ||
    backend === 'r2' ||
    backend === 'b2' ||
    backend === 'backblaze' ||
    (backend !== 'local' && Boolean(process.env.S3_BUCKET || process.env.B2_BUCKET || process.env.B2_BUCKET_NAME));

  if (isS3) {
    return {
      backend: 's3',
      mode: 'Backblaze B2 / S3 Cloud',
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxFileSizeLabel: '500 MB',
      botApiEnabled: false,
      mtprotoEnabled: false,
      mtprotoMode: 'none',
      customBotApiUrl: false,
      b2FallbackEnabled: false,
      archiveOnDelete: false,
    };
  }

  return {
    backend: 'local',
    mode: 'Local Disk Storage',
    maxFileSizeBytes: 500 * 1024 * 1024,
    maxFileSizeLabel: '500 MB',
    botApiEnabled: false,
    mtprotoEnabled: false,
    mtprotoMode: 'none',
    customBotApiUrl: false,
    b2FallbackEnabled: false,
    archiveOnDelete: false,
  };
}

export function getStorageAdapter(): StorageAdapter {
  if (adapterInstance) return adapterInstance;

  const backend = (process.env.STORAGE_BACKEND || '').toLowerCase().trim();
  const telegramExplicit = backend === 'telegram' || backend === 'tg';
  const s3Explicit = backend === 's3' || backend === 'r2' || backend === 'b2' || backend === 'backblaze';
  const localExplicit = backend === 'local';
  const hasTg = hasTelegramCredentials();

  // Prefer Telegram when explicitly set OR when Telegram credentials exist and another backend wasn't forced
  if (telegramExplicit || (!s3Explicit && !localExplicit && hasTg)) {
    const tgEnv = readTelegramEnv();
    const telegramAdapter = new TelegramStorageAdapter({
      botToken: tgEnv.botToken,
      chatId: tgEnv.chatId,
      botApiBaseUrl: tgEnv.botApiBaseUrl,
      apiId: tgEnv.apiId,
      apiHash: tgEnv.apiHash,
      session: tgEnv.session,
      mtprotoServerUrl: tgEnv.mtprotoServerUrl,
    });

    const b2Fallback = createS3FallbackAdapter();
    adapterInstance = new HybridTelegramB2Adapter(telegramAdapter, b2Fallback);
    const caps = adapterInstance.getCapabilities!();
    console.log(
      `🚀 [Storage] Initialized ${caps.mode} (Max file: ${caps.maxFileSizeLabel}${caps.b2FallbackEnabled ? ', Backblaze B2 read fallback active' : ''})`
    );
    return adapterInstance;
  }

  if (s3Explicit || (!localExplicit && Boolean(process.env.S3_BUCKET || process.env.B2_BUCKET || process.env.B2_BUCKET_NAME))) {
    const s3 = createS3FallbackAdapter();
    if (s3) {
      if (hasTg && s3Explicit) {
        console.warn(
          `⚠️ [Storage] Telegram credentials detected, but STORAGE_BACKEND=${backend} is forcing Backblaze B2. Change STORAGE_BACKEND=telegram in Render Environment to use Telegram with B2 fallback.`
        );
      } else {
        console.log('📦 [Storage] Initialized Backblaze B2 / S3 Cloud');
      }
      adapterInstance = s3;
      return adapterInstance;
    }
  }

  adapterInstance = new LocalDiskStorageAdapter();
  console.log('💾 [Storage] Initialized Local Disk Storage');
  return adapterInstance;
}

export * from './types.ts';
export * from './local.ts';
export * from './s3.ts';
export * from './telegram.ts';
export * from './hybrid.ts';
