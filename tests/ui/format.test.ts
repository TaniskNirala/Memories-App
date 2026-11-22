import { describe, expect, it } from 'vitest';
import { formatBytes, MB, GB, KB } from '../../src/lib/format.ts';
import { errMessage } from '../../src/lib/errors.ts';

describe('formatBytes', () => {
  it('formats KB, MB and GB', () => {
    expect(formatBytes(512 * KB)).toBe('512 KB');
    expect(formatBytes(3.5 * MB)).toBe('3.5 MB');
    expect(formatBytes(2 * GB)).toBe('2.0 GB');
  });
  it('is safe for empty or invalid input', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(NaN)).toBe('0 KB');
    expect(formatBytes(-5)).toBe('0 KB');
  });
});

describe('errMessage', () => {
  it('reads Error and error-like objects', () => {
    expect(errMessage(new Error('boom'))).toBe('boom');
    expect(errMessage({ message: 'plain object' })).toBe('plain object');
  });
  it('returns an empty string otherwise so `|| fallback` works', () => {
    expect(errMessage('text')).toBe('');
    expect(errMessage(null)).toBe('');
    expect(errMessage(undefined)).toBe('');
    expect(errMessage({})).toBe('');
  });
});
