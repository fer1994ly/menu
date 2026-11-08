import { formatWeekDate } from '@/shared/kernel/time';

/** `domingo 15/11/2026` for the week whose delivery Sunday is 2026-11-15. */
export function formatWeekLabel(weekId: string): string {
  return `domingo ${formatWeekDate(weekId)}/${weekId.slice(0, 4)}`;
}

const MONTERREY_OFFSET_MS = 6 * 3_600_000;

/** `2026-11-13 10:00:05` in Monterrey time (UTC−6). */
export function formatInstant(ms: number): string {
  const local = new Date(ms - MONTERREY_OFFSET_MS).toISOString();
  return `${local.slice(0, 10)} ${local.slice(11, 19)}`;
}

/** Value for an `<input type="datetime-local">` showing the Monterrey wall clock. */
export function toLocalInput(ms: number): string {
  return new Date(ms - MONTERREY_OFFSET_MS).toISOString().slice(0, 16);
}

/** Inverse of {@link toLocalInput}; NaN when empty or invalid. */
export function fromLocalInput(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) + MONTERREY_OFFSET_MS;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
