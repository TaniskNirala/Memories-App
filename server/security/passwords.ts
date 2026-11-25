import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 5;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', '1234567890', '12345678910',
  'qwertyuiop', 'qwerty123', 'qwerty12345', 'iloveyou12', 'letmein123', 'welcome123', 'admin12345',
  'administrator', 'abc1234567', '1q2w3e4r5t', 'changeme123', 'trustno1234', 'football123',
]);

/** Returns an error message if the password is unacceptable, otherwise null. */
export function validatePassword(password: unknown, username?: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password is too long (max ${MAX_PASSWORD_BYTES} bytes)`;
  }
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'That password is too common. Please choose another one';
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    return 'Password must not contain your username';
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Pre-computed hash used to keep login timing the same whether or not the username exists
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalisation', BCRYPT_COST);

export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
}
