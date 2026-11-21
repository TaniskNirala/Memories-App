/**
 * One-time CLI helper to generate a Telegram MTProto StringSession (NotaForge-compatible).
 *
 * Usage:
 *   TELEGRAM_API_ID=12345678 TELEGRAM_API_HASH=your_hash npm run telegram:session
 *
 * Get TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org -> API development tools.
 * Paste the generated string into Render's Environment tab as TELEGRAM_SESSION.
 */
import readline from 'readline';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const apiId = parseInt(process.env.TELEGRAM_API_ID || process.argv[2] || '', 10);
const apiHash = (process.env.TELEGRAM_API_HASH || process.argv[3] || '').trim();

if (!apiId || !apiHash) {
  console.error('Usage: TELEGRAM_API_ID=12345678 TELEGRAM_API_HASH=your_hash npm run telegram:session');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => ask('Phone number (with country code, e.g. +91...): '),
    password: async () => ask('2FA password (press Enter if none): '),
    phoneCode: async () => ask('OTP code sent to your Telegram app: '),
    onError: (err) => console.error('Auth error:', err),
  });

  const session = String(client.session.save());
  console.log('\nSession generated successfully!\n');
  console.log('Add this to Render Environment Variables as TELEGRAM_SESSION:\n');
  console.log(session);
  console.log('\nKeep this value strictly secret — never commit it to git.\n');

  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate session:', err);
  rl.close();
  process.exit(1);
});
