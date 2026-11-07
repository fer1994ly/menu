import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCTION_SETTINGS } from '../types';
import { verifyIntegerPlan } from '../verification';
import type { Recipe } from '../types';

const recipe = (code: string, kcal: number, protein: number, chickenG = 0, beefG = 0, cost = 10): Recipe => ({
  code,
  name: code,
  kcal,
  protein,
  cost,
  chickenG,
  beefG,
  glutenFree: false,
});

const verify = (recipes: Recipe[], portions: Record<string, number>, chickenCapG = 1e9, beefCapG = 1e9) =>
  verifyIntegerPlan({
    recipes,
    portionsByCode: portions,
    totalPortions: Object.values(portions).reduce((a, b) => a + b, 0),
    chickenCapG,
    beefCapG,
    settings: DEFAULT_PRODUCTION_SETTINGS,
  });

describe('verifyIntegerPlan', () => {
  it('computes cost in cents, rounded averages and cap usage', () => {
    const v = verify([recipe('R1', 500, 40, 100, 0, 12.34), recipe('R2', 520, 38, 0, 50, 10)], { R1: 2, R2: 1 });
    expect(v.costCents).toBe(2 * 1234 + 1000);
    expect(v.cost).toBe(34.68);
    expect(v.avgKcal).toBe(506.67);
    expect(v.avgProtein).toBe(39.33);
    expect(v.capUsage).toEqual({ chicken: { used: 200, cap: 1e9 }, beef: { used: 50, cap: 1e9 } });
    expect(v.warnings).toEqual([]);
  });

  it('warns with the exact protein text', () => {
    const v = verify([recipe('R1', 500, 36.98)], { R1: 1 });
    expect(v.warnings).toEqual(['Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g']);
  });

  it('compares the half-up rounded average against the minimum', () => {
    // 36.995 rounds to 37.00, which meets the minimum
    const v = verify([recipe('R1', 500, 36.995)], { R1: 1 });
    expect(v.avgProtein).toBe(37);
    expect(v.warnings).toEqual([]);
  });

  it('warns about chicken and beef caps with the excess in grams', () => {
    const v = verify([recipe('R1', 500, 40, 100, 80)], { R1: 10 }, 960, 0);
    expect(v.warnings).toEqual([
      'Las porciones enteras superan el tope de pollo en 40 g',
      'Las porciones enteras superan el tope de res en 800 g',
    ]);
  });

  it('formats large excesses with the Spanish thousands separator', () => {
    const v = verify([recipe('R1', 500, 40, 0, 150)], { R1: 20 }, 0, 0);
    expect(v.warnings).toEqual(['Las porciones enteras superan el tope de res en 3.000 g']);
  });

  it('warns about kcal below minimum and above maximum', () => {
    const low = verify([recipe('R1', 479.5, 40)], { R1: 2 });
    expect(low.warnings).toEqual(['Kcal promedio 479,50: queda por debajo del mínimo de 480']);
    const high = verify([recipe('R1', 546.1, 40)], { R1: 2 });
    expect(high.warnings).toEqual(['Kcal promedio 546,10: queda por encima del máximo de 545']);
  });

  it('uses configurable thresholds in the message', () => {
    const v = verifyIntegerPlan({
      recipes: [recipe('R1', 500, 40)],
      portionsByCode: { R1: 1 },
      totalPortions: 1,
      chickenCapG: 0,
      beefCapG: 0,
      settings: { ...DEFAULT_PRODUCTION_SETTINGS, proteinMin: 42.5 },
    });
    expect(v.warnings).toEqual(['Proteína promedio 40,00 g: queda por debajo del mínimo de 42,5 g']);
  });
});
