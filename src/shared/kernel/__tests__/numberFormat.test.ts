import { describe, expect, it } from 'vitest';
import { formatDecimal, formatGrams, formatMoney, formatTrimmed, roundHalfUp } from '../numberFormat';

describe('roundHalfUp', () => {
  it('rounds exact halves up despite binary floating error', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(36.995, 2)).toBe(37);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(0.5, 0)).toBe(1);
  });

  it('treats solver noise around a half as the exact half, but respects real differences', () => {
    expect(roundHalfUp(79.0749999999999, 2)).toBe(79.08);
    expect(roundHalfUp(79.0749, 2)).toBe(79.07);
    expect(roundHalfUp(0.1234564, 6)).toBe(0.123456);
  });

  it('absorbs solver noise just above a half', () => {
    expect(roundHalfUp(79.0750000000001, 2)).toBe(79.08);
  });

  it('rounds half away from zero for negatives and never returns -0', () => {
    expect(roundHalfUp(-1.005, 2)).toBe(-1.01);
    expect(Object.is(roundHalfUp(-0.0000001, 2), 0)).toBe(true);
  });

  it('handles exponent notation and non-finite values', () => {
    expect(roundHalfUp(1e-7, 6)).toBe(0);
    expect(roundHalfUp(5e-7, 6)).toBe(0.000001);
    expect(roundHalfUp(1e21, 2)).toBe(1e21);
    expect(roundHalfUp(Number.NaN, 2)).toBeNaN();
  });
});

describe('Spanish formatters', () => {
  it('formats decimals with comma and thousands dot', () => {
    expect(formatDecimal(36.98, 2)).toBe('36,98');
    expect(formatDecimal(14710.5, 2)).toBe('14.710,50');
    expect(formatDecimal(1234567.891, 2)).toBe('1.234.567,89');
    expect(formatDecimal(-1234.5, 1)).toBe('-1.234,5');
    expect(formatDecimal(999, 0)).toBe('999');
  });

  it('formats money with a dollar sign', () => {
    expect(formatMoney(14710.5)).toBe('$14.710,50');
    expect(formatMoney(298)).toBe('$298,00');
  });

  it('formats grams and trimmed numbers', () => {
    expect(formatGrams(25940)).toBe('25.940 g');
    expect(formatTrimmed(480)).toBe('480');
    expect(formatTrimmed(545.5)).toBe('545,5');
    expect(formatTrimmed(37)).toBe('37');
    expect(formatTrimmed(1234.25)).toBe('1.234,25');
  });
});
