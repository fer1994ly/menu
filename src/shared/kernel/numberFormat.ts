/**
 * Rounds half away from zero (half-up for positive values) to `decimals` places.
 *
 * Floating point noise is absorbed: the scaled value is first cleaned to 14
 * significant digits, so 1.005 -> 1.01 and 79.0749999999999 -> 79.08 behave as a
 * human reading the exact decimal would expect.
 */
export function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const text = abs.toString();
  const scaled = text.includes('e') ? abs * 10 ** decimals : Number(`${text}e${decimals}`);
  const cleaned = Number(scaled.toPrecision(14));
  const rounded = Math.round(cleaned);
  const result = Number(`${rounded}e-${decimals}`);
  return result === 0 ? 0 : sign * result;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Spanish style: decimal comma, thousands dot. Rounds half-up to `decimals`. */
export function formatDecimal(value: number, decimals = 2): string {
  const rounded = roundHalfUp(value, decimals);
  const negative = rounded < 0;
  const [intPart = '0', fracPart = ''] = Math.abs(rounded).toFixed(decimals).split('.');
  const body = groupThousands(intPart) + (decimals > 0 ? `,${fracPart}` : '');
  return negative ? `-${body}` : body;
}

/** Same as {@link formatDecimal} but drops insignificant trailing decimals (max 2). */
export function formatTrimmed(value: number): string {
  const text = formatDecimal(value, 2);
  return text.includes(',') ? text.replace(/,?0+$/, '') : text;
}

/** `$14.710,50` */
export function formatMoney(units: number): string {
  const text = formatDecimal(units, 2);
  return text.startsWith('-') ? `-$${text.slice(1)}` : `$${text}`;
}

/** `25.940 g` */
export function formatGrams(grams: number): string {
  return `${formatTrimmed(grams)} g`;
}
