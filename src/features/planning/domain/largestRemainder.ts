import { roundHalfUp } from '../../../shared/kernel/numberFormat';

export interface RoundingRow {
  code: string;
  /** Continuous value rounded to 6 decimals. */
  continuous: number;
  integerPart: number;
  /** Fractional part rounded to 6 decimals. */
  fraction: number;
  /** 1 = largest fraction (ties: lower recipe code first). */
  rank: number;
  /** True if this recipe received one of the R extra portions. */
  extra: boolean;
  final: number;
}

export interface LargestRemainderResult {
  /** Rows in the input order. */
  rows: RoundingRow[];
  /** R = total - sum of integer parts. */
  remainder: number;
}

const compareCodes = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });

/**
 * Largest remainder rounding: round each value to 6 decimals, keep the integer
 * parts and hand the R missing portions to the largest fractions. Equal
 * fractions (after 6-decimal rounding) go to the lower recipe code (R2 < R10).
 */
export function distributeLargestRemainder(
  values: readonly { code: string; value: number }[],
  total: number,
): LargestRemainderResult {
  const prepared = values.map(({ code, value }) => {
    const continuous = Math.max(0, roundHalfUp(value, 6));
    const integerPart = Math.floor(continuous);
    return { code, continuous, integerPart, fraction: roundHalfUp(continuous - integerPart, 6) };
  });
  const remainder = Math.max(0, total - prepared.reduce((sum, p) => sum + p.integerPart, 0));
  const ordered = [...prepared].sort((a, b) => b.fraction - a.fraction || compareCodes(a.code, b.code));
  const rankByCode = new Map(ordered.map((p, i) => [p.code, i + 1]));
  const rows = prepared.map((p): RoundingRow => {
    const rank = rankByCode.get(p.code) ?? 0;
    const extra = rank <= remainder;
    return { ...p, rank, extra, final: p.integerPart + (extra ? 1 : 0) };
  });
  return { rows, remainder };
}
