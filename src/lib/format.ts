/* ---------------------------------------------------------------------------
   Small, dependency-free formatting helpers shared across the UI.
   --------------------------------------------------------------------------- */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12" — used inside the timeline day node. */
export function dayNumber(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? String(d.getDate()).padStart(2, '0') : '••';
}

/** "Mar" */
export function monthShort(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? MONTHS_SHORT[d.getMonth()] : '';
}

/** "12 Mar" or "12 Mar 2023" when not the current year. */
export function shortDate(value?: string | Date | null, opts: { year?: boolean } = {}): string {
  const d = toDate(value);
  if (!d) return '';
  const showYear = opts.year ?? d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
}

/** "March 2024" */
export function monthYearLabel(value?: string | Date | null): string {
  const d = toDate(value);
  if (!d) return 'Recent memories';
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Tuesday, 12 March" */
export function longDate(value?: string | Date | null): string {
  const d = toDate(value);
  if (!d) return '';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** Human relative time: "just now", "2h ago", "3 days ago", "2 years ago". */
export function relativeTime(value?: string | Date | null): string {
  const d = toDate(value);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const future = diff < 0;
  const sec = Math.abs(diff) / 1000;

  const pick = (n: number, unit: string) =>
    `${future ? 'in ' : ''}${n} ${unit}${n === 1 ? '' : 's'}${future ? '' : ' ago'}`;

  if (sec < 45) return future ? 'in a moment' : 'just now';
  if (sec < 90) return pick(1, 'min');
  if (sec < 3600) return pick(Math.round(sec / 60), 'min');
  if (sec < 7200) return pick(1, 'hour');
  if (sec < 86400) return pick(Math.round(sec / 3600), 'hour');
  if (sec < 172800) return future ? 'tomorrow' : 'yesterday';
  if (sec < 2592000) return pick(Math.round(sec / 86400), 'day');
  if (sec < 31536000) return pick(Math.round(sec / 2592000), 'month');
  return pick(Math.round(sec / 31536000), 'year');
}

/** "Afternoon" / "Morning" greetings for the hero band. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

export function initials(name?: string, fallback = '?'): string {
  const clean = (name || '').trim();
  if (!clean) return fallback;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function plural(count: number, singular: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? singular : pluralWord || `${singular}s`}`;
}

/** Deterministic hue from any string — keeps circle/avatar colours stable. */
export function hueFromString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 360;
  return h;
}

export function avatarGradient(color?: string, name = ''): string {
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) {
    return `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 55%, #0b0d14))`;
  }
  const h = hueFromString(name || 'nest');
  return `linear-gradient(140deg, hsl(${h} 82% 62%), hsl(${(h + 38) % 360} 76% 46%))`;
}

/** Accent hue for timeline nodes, derived from the author name. */
export function accentFromName(name?: string): string {
  const h = hueFromString(name || 'nest');
  const isLight = typeof document !== 'undefined' && !document.documentElement.classList.contains('dark');
  return isLight ? `hsl(${h} 72% 38%)` : `hsl(${h} 78% 62%)`;
}

export function clampText(text: string, max = 120): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ---------------------------------------------------------------------------
   Byte sizes
   --------------------------------------------------------------------------- */

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

/** "512 KB", "3.5 MB", "2.0 GB". Safe for empty / invalid input ("0 KB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / KB)} KB`;
}