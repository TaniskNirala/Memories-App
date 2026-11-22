/**
 * Tiny structured logger used instead of raw console.* calls on the server.
 *
 *   LOG_LEVEL   = debug | info (default) | warn | error | silent
 *   LOG_FORMAT  = text (default) | json     (json = one object per line, easy to search in Render/Datadog)
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function threshold(): number {
  const v = String(process.env.LOG_LEVEL || 'info').toLowerCase() as Level | 'silent';
  return ORDER[v] ?? ORDER.info;
}

function stringify(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function emit(level: Level, args: unknown[]): void {
  if (ORDER[level] < threshold()) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (String(process.env.LOG_FORMAT || 'text').toLowerCase() === 'json') {
    sink(JSON.stringify({ time: new Date().toISOString(), level, message: args.map(stringify).join(' ') }));
  } else {
    sink(...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};

/**
 * Safely read a message from whatever was thrown in a `catch (err)` block.
 * Returns '' when there is none, so `errMessage(err) || 'Fallback text'` works as expected.
 */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '';
}
