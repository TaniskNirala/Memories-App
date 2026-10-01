export interface SignedUploadUrlResult {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  publicViewUrl?: string;
  storageKey: string;
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

  // Direct buffer save helper if needed by seed or server tasks
  putObject(
    storageKey: string,
    data: Buffer,
    contentType: string
  ): Promise<void>;

  getObject?(
    storageKey: string
  ): Promise<{ data: Buffer; contentType: string } | null>;
}
