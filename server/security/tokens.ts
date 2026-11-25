import crypto from 'crypto';

/** Session and reset tokens are stored hashed so a database leak does not hand out live sessions. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
