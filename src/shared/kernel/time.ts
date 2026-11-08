/**
 * Calendar rules for the weekly cycle.
 *
 * America/Monterrey is a fixed UTC-6 (no daylight saving since 2022), so every
 * conversion is plain arithmetic and independent of the host time zone.
 *
 * A week is identified by its delivery Sunday (`YYYY-MM-DD`). Orders are received
 * Sunday to Saturday and the week closes on the Saturday before that Sunday.
 */

export interface CloseTime {
  hour: number;
  minute: number;
}

export const DEFAULT_CLOSE_TIME: CloseTime = { hour: 11, minute: 30 };

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;
/** Monterrey is UTC-6: local wall clock = UTC - 6 h. */
const OFFSET_MS = 6 * HOUR_MS;
const WEEK_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type Instant = Date | number;

const toMs = (instant: Instant): number => (typeof instant === 'number' ? instant : instant.getTime());

/** Close precision is whole seconds: 11:30:00.999 is still 11:30:00. */
const truncateToSecond = (ms: number): number => Math.floor(ms / 1000) * 1000;

/** UTC midnight of a `YYYY-MM-DD` date. */
function dateToUtcMs(date: string): number {
  const match = WEEK_ID_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid date "${date}"`);
  }
  return ms;
}

const utcMsToDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function addDaysToDate(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

export const nextWeekId = (weekId: string): string => addDaysToDate(weekId, 7);
export const previousWeekId = (weekId: string): string => addDaysToDate(weekId, -7);

/** `15/11` for the week of Sunday 2026-11-15. */
export function formatWeekDate(weekId: string): string {
  dateToUtcMs(weekId);
  const [, month, day] = weekId.split('-');
  return `${day}/${month}`;
}

/** Epoch ms of the Saturday close (local `closeTime`) that ends the week `weekId`. */
export function closeInstantForWeek(weekId: string, closeTime: CloseTime = DEFAULT_CLOSE_TIME): number {
  const saturday = dateToUtcMs(weekId) - DAY_MS;
  return saturday + closeTime.hour * HOUR_MS + closeTime.minute * MINUTE_MS + OFFSET_MS;
}

/**
 * Start of the order-intake window of `weekId`: the previous delivery Sunday at
 * 00:00 Monterrey time. Intake runs Sunday to Saturday, so this is the first
 * instant whose orders can belong to the week.
 */
export function weekStartInstant(weekId: string): number {
  return dateToUtcMs(weekId) - 7 * DAY_MS + OFFSET_MS;
}

interface CalendarClose {
  /** UTC midnight of the local Saturday of the instant's Sunday-Saturday week. */
  saturdayMs: number;
  /** Seconds-truncated instant as local wall clock ms. */
  localMs: number;
  closeLocalMs: number;
}

function calendarClose(instant: Instant, closeTime: CloseTime): CalendarClose {
  const localMs = truncateToSecond(toMs(instant)) - OFFSET_MS;
  const local = new Date(localMs);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const saturdayMs = midnight + (6 - local.getUTCDay()) * DAY_MS;
  const closeLocalMs = saturdayMs + closeTime.hour * HOUR_MS + closeTime.minute * MINUTE_MS;
  return { saturdayMs, localMs, closeLocalMs };
}

/**
 * True when the instant falls on the Saturday of its Sunday-Saturday week after
 * the close, i.e. the order missed the close of the week it was placed in.
 */
export function isAfterCalendarClose(instant: Instant, closeTime: CloseTime = DEFAULT_CLOSE_TIME): boolean {
  const { localMs, closeLocalMs } = calendarClose(instant, closeTime);
  return localMs > closeLocalMs;
}

/**
 * Week (delivery Sunday) an instant belongs to: the first close at or after it.
 * 11:30:00 is inclusive; 11:30:01 and later go to the next week.
 */
export function weekIdForInstant(instant: Instant, closeTime: CloseTime = DEFAULT_CLOSE_TIME): string {
  const { saturdayMs, localMs, closeLocalMs } = calendarClose(instant, closeTime);
  return utcMsToDate(saturdayMs + (localMs > closeLocalMs ? 8 : 1) * DAY_MS);
}

export function isWeekClosed(weekId: string, now: Instant, closeTime: CloseTime = DEFAULT_CLOSE_TIME): boolean {
  return truncateToSecond(toMs(now)) > closeInstantForWeek(weekId, closeTime);
}

export function msUntilClose(weekId: string, now: Instant, closeTime: CloseTime = DEFAULT_CLOSE_TIME): number {
  return Math.max(0, closeInstantForWeek(weekId, closeTime) - toMs(now));
}
