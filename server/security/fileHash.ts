import crypto from 'crypto';
import fs from 'fs';

/** SHA-256 of a file on disk ('' if it cannot be read). */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(''));
    } catch {
      resolve('');
    }
  });
}
