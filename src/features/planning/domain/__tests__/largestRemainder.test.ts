import { describe, expect, it } from 'vitest';
import { distributeLargestRemainder } from '../largestRemainder';
import { mulberry32 } from './fixtures';

describe('distributeLargestRemainder', () => {
  it('gives the extra portions to the largest fractions', () => {
    const { rows, remainder } = distributeLargestRemainder(
      [
        { code: 'R1', value: 2.7 },
        { code: 'R2', value: 3.2 },
        { code: 'R3', value: 4.1 },
      ],
      10,
    );
    expect(remainder).toBe(1);
    expect(rows.map((r) => r.final)).toEqual([3, 3, 4]);
    expect(rows.find((r) => r.extra)?.code).toBe('R1');
  });

  it('breaks exact ties by the lower recipe code, comparing numeric parts (R2 before R10)', () => {
    const { rows } = distributeLargestRemainder(
      [
        { code: 'R10', value: 1.5 },
        { code: 'R2', value: 1.5 },
        { code: 'R3', value: 1 },
      ],
      4,
    );
    expect(rows.find((r) => r.code === 'R2')?.extra).toBe(true);
    expect(rows.find((r) => r.code === 'R10')?.extra).toBe(false);
  });

  it('treats 0.3333333 and 0.3333334 as a tie after rounding to 6 decimals', () => {
    const { rows } = distributeLargestRemainder(
      [
        { code: 'R5', value: 1.3333334 },
        { code: 'R1', value: 1.3333333 },
        { code: 'R2', value: 2.3333333 },
      ],
      6,
    );
    expect(rows.map((r) => r.fraction)).toEqual([0.333333, 0.333333, 0.333333]);
    expect(rows.find((r) => r.extra)?.code).toBe('R1');
  });

  it('adds nothing when the solution is already integer', () => {
    const { rows, remainder } = distributeLargestRemainder(
      [
        { code: 'R1', value: 5 },
        { code: 'R2', value: 4.9999999 },
      ],
      9,
    );
    expect(remainder).toBe(0);
    expect(rows.map((r) => r.final)).toEqual([5, 5]);
    expect(rows.every((r) => !r.extra)).toBe(true);
  });

  it('reports rank, continuous value and integer part per row', () => {
    const { rows } = distributeLargestRemainder(
      [
        { code: 'R1', value: 1.25 },
        { code: 'R2', value: 1.75 },
      ],
      3,
    );
    expect(rows[1]).toMatchObject({ code: 'R2', continuous: 1.75, integerPart: 1, fraction: 0.75, rank: 1, extra: true, final: 2 });
    expect(rows[0]).toMatchObject({ rank: 2, extra: false, final: 1 });
  });

  it('property: always sums exactly to the requested total', () => {
    const rand = mulberry32(2604);
    for (let trial = 0; trial < 500; trial++) {
      const n = 4 + Math.floor(rand() * 4);
      const total = 5 * (1 + Math.floor(rand() * 120));
      const weights = Array.from({ length: n }, () => 0.1 + rand());
      const sum = weights.reduce((a, b) => a + b, 0);
      const values = weights.map((w) => (w / sum) * total);
      const { rows } = distributeLargestRemainder(
        values.map((value, i) => ({ code: `R${i + 1}`, value })),
        total,
      );
      expect(rows.reduce((a, r) => a + r.final, 0)).toBe(total);
      for (const row of rows) {
        expect(row.final - row.continuous).toBeLessThan(1 + 1e-6);
        expect(row.continuous - row.final).toBeLessThan(1 + 1e-6);
      }
    }
  });
});
