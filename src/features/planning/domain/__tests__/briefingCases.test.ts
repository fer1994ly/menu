import { describe, expect, it } from 'vitest';
import { buildShoppingList } from '../../../shopping/domain/shoppingList';
import { roundHalfUp } from '../../../../shared/kernel/numberFormat';
import { planProduction, type PlanSuccess } from '../planProduction';
import { TEST_RECIPES } from './fixtures';

const NO_SOLUTION =
  'No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.';

function asMap(rows: { code: string; portions: number }[], decimals?: number): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.code, decimals === undefined ? r.portions : roundHalfUp(r.portions, decimals)]));
}

function solve(input: { blocked?: string[]; D: number; G: number; chickenKg: number; beefKg: number }): PlanSuccess {
  const result = planProduction({
    recipes: TEST_RECIPES,
    blockedCodes: input.blocked ?? [],
    totalPortions: input.D,
    glutenFreePortions: input.G,
    chickenCapG: input.chickenKg * 1000,
    beefCapG: input.beefKg * 1000,
  });
  if (result.status !== 'optimal') throw new Error(`Expected optimal, got ${result.status}`);
  return result;
}

function extras(plan: PlanSuccess): string[] {
  return plan.rounding
    .filter((r) => r.extra)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.code);
}

function shopping(plan: PlanSuccess) {
  return buildShoppingList(TEST_RECIPES, asMap(plan.integer));
}

describe('Briefing case 1: normal week with fraction tie', () => {
  const plan = solve({ D: 300, G: 25, chickenKg: 26, beefKg: 20 });

  it('continuous solution and cost', () => {
    expect(asMap(plan.continuous, 2)).toEqual({ R1: 79.07, R2: 38.33, R3: 64.26, R4: 58.33, R5: 30, R6: 30 });
    expect(roundHalfUp(plan.continuousCost, 2)).toBe(14700.56);
  });

  it('largest remainder: R = 1 and the R2/R4 tie goes to the lower code', () => {
    expect(plan.rounding.map((r) => r.integerPart)).toEqual([79, 38, 64, 58, 30, 30]);
    expect(plan.remainder).toBe(1);
    expect(plan.rounding.find((r) => r.code === 'R2')?.fraction).toBe(0.333333);
    expect(plan.rounding.find((r) => r.code === 'R4')?.fraction).toBe(0.333333);
    expect(extras(plan)).toEqual(['R2']);
  });

  it('integer solution, cost, averages and no warnings', () => {
    expect(asMap(plan.integer)).toEqual({ R1: 79, R2: 39, R3: 64, R4: 58, R5: 30, R6: 30 });
    expect(plan.integerCost).toBe(14710.5);
    expect(plan.avgKcal).toBe(544.8);
    expect(plan.avgProtein).toBe(37);
    expect(plan.warnings).toEqual([]);
  });

  it('shopping list', () => {
    const list = shopping(plan);
    expect(list.chicken).toMatchObject({ grams: 25940, packages: 13, costCents: 387400, leftoverGrams: 60 });
    expect(list.beef).toMatchObject({ grams: 13280, packages: 14, costCents: 306600, leftoverGrams: 720 });
  });

  it('keeps the real pivots of both models for the explanation', () => {
    expect(plan.traces.costModel.phases.length).toBeGreaterThan(0);
    expect(plan.traces.proteinModel).not.toBeNull();
  });
});

describe('Briefing case 2: rounding trap that breaks an average', () => {
  const plan = solve({ D: 155, G: 25, chickenKg: 13, beefKg: 20 });

  it('continuous solution and cost', () => {
    expect(asMap(plan.continuous, 2)).toEqual({ R1: 46.17, R2: 20.71, R3: 36.91, R4: 20.21, R5: 15.5, R6: 15.5 });
    expect(roundHalfUp(plan.continuousCost, 2)).toBe(7663.6);
  });

  it('largest remainder order: R3, R2, then the R5/R6 tie goes to R5', () => {
    expect(plan.rounding.map((r) => r.integerPart)).toEqual([46, 20, 36, 20, 15, 15]);
    expect(plan.remainder).toBe(3);
    expect(plan.rounding.find((r) => r.code === 'R3')?.fraction).toBe(0.912037);
    expect(plan.rounding.find((r) => r.code === 'R2')?.fraction).toBe(0.708333);
    expect(extras(plan)).toEqual(['R3', 'R2', 'R5']);
  });

  it('integer solution, cost, averages and the protein warning', () => {
    expect(asMap(plan.integer)).toEqual({ R1: 46, R2: 21, R3: 37, R4: 20, R5: 16, R6: 15 });
    expect(plan.integerCost).toBe(7693);
    expect(plan.avgKcal).toBe(544.65);
    expect(plan.avgProtein).toBe(36.98);
    expect(plan.warnings).toEqual(['Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g']);
  });

  it('shopping list', () => {
    const list = shopping(plan);
    expect(list.chicken).toMatchObject({ grams: 12880, packages: 7, costCents: 208600, leftoverGrams: 1120 });
    expect(list.beef).toMatchObject({ grams: 7430, packages: 8, costCents: 175200, leftoverGrams: 570 });
  });
});

describe('Briefing case 3: no-solution trap', () => {
  const result = planProduction({
    recipes: TEST_RECIPES,
    blockedCodes: [],
    totalPortions: 300,
    glutenFreePortions: 25,
    chickenCapG: 10000,
    beefCapG: 20000,
  });

  it('returns the exact no-plan message and no solution data', () => {
    expect(result.status).toBe('infeasible');
    expect(result.message).toBe(NO_SOLUTION);
    expect('integer' in result).toBe(false);
    expect('continuous' in result).toBe(false);
  });
});

describe('Briefing case 4: rotation and cap broken by rounding', () => {
  const plan = solve({ blocked: ['R4'], D: 300, G: 180, chickenKg: 26, beefKg: 20 });

  it('continuous solution (R4 out of the model) and cost', () => {
    expect(asMap(plan.continuous, 2)).toEqual({ R1: 90, R2: 57.5, R3: 40.83, R5: 30, R6: 81.67 });
    expect(roundHalfUp(plan.continuousCost, 2)).toBe(14950.83);
  });

  it('largest remainder: R3 then R6, R2 (0,5) gets nothing', () => {
    expect(plan.rounding.map((r) => r.integerPart)).toEqual([90, 57, 40, 30, 81]);
    expect(plan.remainder).toBe(2);
    expect(plan.rounding.find((r) => r.code === 'R3')?.fraction).toBe(0.833333);
    expect(plan.rounding.find((r) => r.code === 'R6')?.fraction).toBe(0.666667);
    expect(extras(plan)).toEqual(['R3', 'R6']);
    expect(plan.rounding.find((r) => r.code === 'R2')?.extra).toBe(false);
  });

  it('integer solution, cost, averages and the chicken cap warning', () => {
    expect(asMap(plan.integer)).toEqual({ R1: 90, R2: 57, R3: 41, R5: 30, R6: 82 });
    expect(plan.integerCost).toBe(14942);
    expect(plan.avgKcal).toBe(541.83);
    expect(plan.avgProtein).toBe(37);
    expect(plan.capUsage.chicken).toEqual({ used: 26040, cap: 26000 });
    expect(plan.warnings).toEqual(['Las porciones enteras superan el tope de pollo en 40 g']);
  });

  it('shopping list', () => {
    const list = shopping(plan);
    expect(list.chicken).toMatchObject({ grams: 26040, packages: 14, costCents: 417200, leftoverGrams: 1960 });
    expect(list.beef).toMatchObject({ grams: 13630, packages: 14, costCents: 306600, leftoverGrams: 370 });
  });
});
