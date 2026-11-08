import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  closeInstantForWeek,
  formatWeekDate,
  isAfterCalendarClose,
  isWeekClosed,
  msUntilClose,
  nextWeekId,
  previousWeekId,
  productionWeekId,
  weekIdForInstant,
  weekStartInstant,
} from '../time';

/** Monterrey wall clock (UTC-6) to epoch ms. */
const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  Date.UTC(y, mo - 1, d, h + 6, mi, s, ms);

describe('closeInstantForWeek', () => {
  it('is the Saturday before the delivery Sunday at 11:30 Monterrey time', () => {
    expect(closeInstantForWeek('2026-11-15')).toBe(local(2026, 11, 14, 11, 30));
    expect(new Date(closeInstantForWeek('2026-11-15')).toISOString()).toBe('2026-11-14T17:30:00.000Z');
  });

  it('honours a configurable close time', () => {
    expect(closeInstantForWeek('2026-11-15', { hour: 10, minute: 5 })).toBe(local(2026, 11, 14, 10, 5));
  });

  it('rejects malformed week ids', () => {
    expect(() => closeInstantForWeek('15/11/2026')).toThrow(RangeError);
    expect(() => closeInstantForWeek('2026-13-40')).toThrow(RangeError);
  });
});

describe('weekIdForInstant', () => {
  it('keeps an order at exactly Saturday 11:30:00 in the current week', () => {
    expect(weekIdForInstant(local(2026, 11, 14, 11, 30, 0))).toBe('2026-11-15');
  });

  it('moves an order at Saturday 11:30:01 to the next week', () => {
    expect(weekIdForInstant(local(2026, 11, 14, 11, 30, 1))).toBe('2026-11-22');
  });

  it('moves an order at Saturday 11:31 to the next week', () => {
    expect(weekIdForInstant(local(2026, 11, 14, 11, 31))).toBe('2026-11-22');
  });

  it('has second precision: 11:30:00.999 still counts as 11:30:00', () => {
    expect(weekIdForInstant(local(2026, 11, 14, 11, 30, 0, 999))).toBe('2026-11-15');
  });

  it('assigns Sunday to Saturday orders to the coming Saturday close', () => {
    expect(weekIdForInstant(local(2026, 11, 9, 9, 0))).toBe('2026-11-15'); // Monday
    expect(weekIdForInstant(local(2026, 11, 8, 0, 0))).toBe('2026-11-15'); // Sunday 00:00
    expect(weekIdForInstant(local(2026, 11, 15, 10, 0))).toBe('2026-11-22'); // delivery Sunday
    expect(weekIdForInstant(local(2026, 11, 14, 0, 0))).toBe('2026-11-15');
  });

  it('accepts Date instances and a custom close time', () => {
    expect(weekIdForInstant(new Date(local(2026, 11, 14, 10, 0, 1)), { hour: 10, minute: 0 })).toBe('2026-11-22');
    expect(weekIdForInstant(new Date(local(2026, 11, 14, 10, 0, 0)), { hour: 10, minute: 0 })).toBe('2026-11-15');
  });

  it('crosses month and year boundaries', () => {
    expect(weekIdForInstant(local(2026, 12, 30, 12, 0))).toBe('2027-01-03');
  });
});

describe('isAfterCalendarClose', () => {
  it('is true only on Saturday after the close', () => {
    expect(isAfterCalendarClose(local(2026, 11, 14, 11, 30, 1))).toBe(true);
    expect(isAfterCalendarClose(local(2026, 11, 14, 11, 30, 0))).toBe(false);
    expect(isAfterCalendarClose(local(2026, 11, 15, 8, 0))).toBe(false);
  });
});

describe('week navigation', () => {
  it('moves by whole weeks', () => {
    expect(nextWeekId('2026-12-27')).toBe('2027-01-03');
    expect(previousWeekId('2027-01-03')).toBe('2026-12-27');
    expect(addDaysToDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('week start is the previous delivery Sunday at 00:00 local', () => {
    expect(weekStartInstant('2026-11-15')).toBe(local(2026, 11, 8, 0, 0));
  });

  it('formats the Sunday as DD/MM', () => {
    expect(formatWeekDate('2026-11-15')).toBe('15/11');
    expect(formatWeekDate('2027-01-03')).toBe('03/01');
  });
});

describe('isWeekClosed / msUntilClose', () => {
  const week = '2026-11-15';
  it('is open through 11:30:00 and closed from 11:30:01', () => {
    expect(isWeekClosed(week, local(2026, 11, 14, 11, 30, 0))).toBe(false);
    expect(isWeekClosed(week, local(2026, 11, 14, 11, 30, 0, 999))).toBe(false);
    expect(isWeekClosed(week, local(2026, 11, 14, 11, 30, 1))).toBe(true);
  });

  it('counts down and never goes negative', () => {
    expect(msUntilClose(week, local(2026, 11, 14, 11, 0))).toBe(30 * 60 * 1000);
    expect(msUntilClose(week, local(2026, 11, 14, 12, 0))).toBe(0);
  });
});

describe('productionWeekId', () => {
  it('stays on the closing week after the Saturday close and on delivery Sunday', () => {
    expect(productionWeekId(local(2026, 11, 13, 10))).toBe('2026-11-15'); // Friday
    expect(productionWeekId(local(2026, 11, 14, 11, 31))).toBe('2026-11-15'); // Saturday after close
    expect(productionWeekId(local(2026, 11, 15, 9))).toBe('2026-11-15'); // delivery Sunday
    expect(productionWeekId(local(2026, 11, 16, 0, 0, 1))).toBe('2026-11-22'); // Monday
  });
});
