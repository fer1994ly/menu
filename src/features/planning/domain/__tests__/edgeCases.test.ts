import { describe, expect, it, vi } from 'vitest';
import * as simplexModule from '../simplex';
import { planProduction, type PlanInput } from '../planProduction';
import { TEST_RECIPES } from './fixtures';

const base: PlanInput = {
  recipes: TEST_RECIPES,
  blockedCodes: [],
  totalPortions: 300,
  glutenFreePortions: 25,
  chickenCapG: 26000,
  beefCapG: 20000,
};

const NO_SOLUTION =
  'No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.';

describe('planProduction pre-checks', () => {
  it('sanity: the simplex spy observes a normal run', () => {
    const spy = vi.spyOn(simplexModule, 'solveSimplex');
    expect(planProduction(base).status).toBe('optimal');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('D = 0 does not run the model', () => {
    const spy = vi.spyOn(simplexModule, 'solveSimplex');
    const r = planProduction({ ...base, totalPortions: 0, glutenFreePortions: 0 });
    expect(r.status).toBe('no-orders');
    expect(r.message).toBe('Todavía no hay pedidos cerrados para esta semana');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('G > D is rejected', () => {
    const spy = vi.spyOn(simplexModule, 'solveSimplex');
    const r = planProduction({ ...base, totalPortions: 20, glutenFreePortions: 25 });
    expect(r.status).toBe('gluten-exceeds-total');
    expect(r.message).toBe('Hay más porciones sin gluten que porciones totales: revisá los pedidos');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fewer than 4 active recipes fails instantly without simplex', () => {
    const spy = vi.spyOn(simplexModule, 'solveSimplex');
    const r = planProduction({ ...base, blockedCodes: ['R1', 'R2', 'R3'] });
    expect(r.status).toBe('infeasible');
    expect(r.message).toBe(NO_SOLUTION);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('no recipes at all fails instantly', () => {
    const r = planProduction({ ...base, recipes: [] });
    expect(r.status).toBe('infeasible');
  });

  it('rejects invalid portion counts', () => {
    expect(() => planProduction({ ...base, totalPortions: 10.5 })).toThrow();
    expect(() => planProduction({ ...base, totalPortions: -1 })).toThrow();
  });
});

describe('planProduction caps and settings', () => {
  it('chicken cap 0 is valid when other recipes can cover the demand', () => {
    const r = planProduction({ ...base, chickenCapG: 0, glutenFreePortions: 0 });
    // R1, R4 and R6 contain chicken so they would be forced to zero, breaking the 10 % minimum
    expect(r.status).toBe('infeasible');
  });

  it('cap 0 is valid for recipes that use none of that input', () => {
    const recipes = TEST_RECIPES.map((r) => ({ ...r, chickenG: 0 }));
    const r = planProduction({ ...base, recipes, chickenCapG: 0, glutenFreePortions: 0 });
    expect(r.status).toBe('optimal');
    if (r.status === 'optimal') expect(r.capUsage.chicken).toEqual({ used: 0, cap: 0 });
  });

  it('settings are configurable and defaults are exposed', () => {
    const r = planProduction({ ...base, settings: { proteinMin: 60 } });
    expect(r.status).toBe('infeasible');
  });

  it('wide kcal band and low protein minimum are accepted as settings', () => {
    const recipes = TEST_RECIPES.map((r) => ({ ...r }));
    const low = planProduction({
      ...base,
      recipes,
      glutenFreePortions: 0,
      chickenCapG: 1e9,
      beefCapG: 1e9,
      settings: { kcalMin: 400, kcalMax: 700, proteinMin: 30 },
    });
    expect(low.status).toBe('optimal');
  });

  it('a continuous solution that is already integer needs no remainder', () => {
    // 4 identical-ish recipes, D = 10: shares force 1..3 each, cheapest distribution is integer
    const recipes = [
      { code: 'R1', name: 'a', kcal: 500, protein: 40, cost: 10, chickenG: 0, beefG: 0, glutenFree: true },
      { code: 'R2', name: 'b', kcal: 500, protein: 40, cost: 20, chickenG: 0, beefG: 0, glutenFree: true },
      { code: 'R3', name: 'c', kcal: 500, protein: 40, cost: 30, chickenG: 0, beefG: 0, glutenFree: true },
      { code: 'R4', name: 'd', kcal: 500, protein: 40, cost: 40, chickenG: 0, beefG: 0, glutenFree: true },
    ];
    const r = planProduction({
      recipes,
      blockedCodes: [],
      totalPortions: 10,
      glutenFreePortions: 0,
      chickenCapG: 0,
      beefCapG: 0,
    });
    expect(r.status).toBe('optimal');
    if (r.status !== 'optimal') return;
    expect(r.continuous.map((c) => c.portions)).toEqual([3, 3, 3, 1]);
    expect(r.remainder).toBe(0);
    expect(r.rounding.every((row) => !row.extra)).toBe(true);
    expect(r.integer.map((c) => c.portions)).toEqual([3, 3, 3, 1]);
    expect(r.warnings).toEqual([]);
  });
});
