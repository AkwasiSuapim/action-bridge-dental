/**
 * Display formatting. Formatting never changes underlying cents: amounts are always integers
 * from the engine, and parsed input is converted to exact integer cents.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 120000 → "$1,200.00"; -12500 → "-$125.00". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${(abs % 100).toString().padStart(2, '0')}`;
}

/**
 * "1,200.50", "$1200.5", "1200" → integer cents. Returns null for empty, negative, malformed
 * or more-than-two-decimal input, so a typo never becomes a silent wrong number.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Cents → editable text without the currency sign: 120000 → "1200.00". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, '0')}`;
}

/** 8000 → "80%"; 6250 → "62.5%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toString()}%`;
}

/** "2026-11-12" → "Nov 12, 2026". Date-only values are never shifted by time zone. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "80", "80%", "62.5" → basis points (8000, 6250). Null for empty, malformed, above 100% or finer than 0.01%. */
export function parsePercentToBps(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

/** UTC timestamp → the device's local "Oct 3, 2026, 4:05 PM". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${clock}`;
}
