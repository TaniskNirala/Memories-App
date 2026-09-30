import crypto from 'crypto';
import { StorageAdapter, SignedUploadUrlResult } from './types.ts';

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string; // Optional custom domain for Cloudflare R2
}

/**
 * Pure SigV4 implementation for Cloudflare R2 & AWS S3 compatible storage
 * without heavy external dependencies.
 */
export class S3StorageAdapter implements StorageAdapter {
  private config: S3Config;
  private region: string;
  private endpoint: string;

  constructor(config: S3Config) {
    this.config = config;
    this.region = config.region || 'auto';
    this.endpoint = config.endpoint || `https://${config.bucket}.s3.${this.region}.amazonaws.com`;
  }

  private hmac(key: Buffer | string, stringToSign: string): Buffer {
    return crypto.createHmac('sha256', key).update(stringToSign, 'utf8').digest();
  }

  private getSigningKey(dateStamp: string): Buffer {
    const kDate = this.hmac('AWS4' + this.config.secretAccessKey, dateStamp);
    const kRegion = this.hmac(kDate, this.region);
    const kService = this.hmac(kRegion, 's3');
    return this.hmac(kService, 'aws4_request');
  }

  private generatePresignedUrl(
    method: 'PUT' | 'GET',
    storageKey: string,
    expiresInSeconds: number,
    headersToSign: Record<string, string> = {}
  ): string {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const cleanKey = storageKey.replace(/^\/+/, '');
    const url = new URL(`${this.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(cleanKey)}`);

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresInSeconds.toString(),
      'X-Amz-SignedHeaders': 'host',
    };

    if (headersToSign['content-type']) {
      queryParams['X-Amz-SignedHeaders'] = 'content-type;host';
    }

    const sortedQuery = Object.keys(queryParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const canonicalHeaders = `host:${url.host}\n` + (headersToSign['content-type'] ? `content-type:${headersToSign['content-type']}\n` : '');
    const signedHeaders = queryParams['X-Amz-SignedHeaders'];

    const canonicalRequest = [
      method,
      `/${encodeURIComponent(cleanKey)}`,
      sortedQuery,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.getSigningKey(dateStamp);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `${url.origin}${url.pathname}?${sortedQuery}&X-Amz-Signature=${signature}`;
  }

  async getSignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<SignedUploadUrlResult> {
    const uploadUrl = this.generatePresignedUrl('PUT', storageKey, expiresInSeconds, {
      'content-type': contentType,
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
    expiresInSeconds: number = 3600
  ): Promise<string> {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/+$/, '')}/${encodeURIComponent(storageKey.replace(/^\/+/, ''))}`;
    }
    return this.generatePresignedUrl('GET', storageKey, expiresInSeconds);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const deleteUrl = this.generatePresignedUrl('PUT', storageKey, 60);
    try {
      await fetch(deleteUrl, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete S3 object', e);
    }
  }

  async putObject(storageKey: string, data: Buffer, contentType: string): Promise<void> {
    const upload = await this.getSignedUploadUrl(storageKey, contentType);
    await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: new Uint8Array(data) as any,
    });
  }
}
