import { distributeLargestRemainder, type RoundingRow } from './largestRemainder';
import { buildCostModel, buildProteinModel, type ModelInput } from './productionModel';
import { solveSimplex, type SimplexResult, type SimplexTrace } from './simplex';
import {
  DEFAULT_PRODUCTION_SETTINGS,
  MESSAGES,
  type ProductionSettings,
  type Recipe,
  type RecipePortions,
} from './types';
import { verifyIntegerPlan, type CapUsage } from './verification';

export interface PlanInput {
  recipes: readonly Recipe[];
  /** Codes served the previous week: removed from the model (rotation). */
  blockedCodes?: readonly string[];
  /** D: total portions of closed orders. */
  totalPortions: number;
  /** G: portions of gluten-free orders. */
  glutenFreePortions: number;
  chickenCapG: number;
  beefCapG: number;
  settings?: Partial<ProductionSettings>;
}

export interface PlanTraces {
  /** Phase 1 + phase 2 of the minimum-cost model. */
  costModel: SimplexTrace;
  /** Phase 1 + phase 2 of the max-protein model at the optimal cost. */
  proteinModel: SimplexTrace | null;
}

export interface PlanSuccess {
  status: 'optimal';
  message?: undefined;
  continuous: RecipePortions[];
  /** Cost of the continuous solution (currency units, unrounded). */
  continuousCost: number;
  rounding: RoundingRow[];
  /** R: portions distributed by largest remainder. */
  remainder: number;
  integer: RecipePortions[];
  integerCost: number;
  integerCostCents: number;
  avgKcal: number;
  avgProtein: number;
  capUsage: { chicken: CapUsage; beef: CapUsage };
  warnings: string[];
  traces: PlanTraces;
}

export interface PlanFailure {
  status: 'no-orders' | 'gluten-exceeds-total' | 'infeasible';
  message: string;
  /** Present only when the simplex actually ran. */
  traces: PlanTraces | null;
}

export type PlanResult = PlanSuccess | PlanFailure;

const fail = (status: PlanFailure['status'], message: string, traces: PlanTraces | null = null): PlanFailure => ({
  status,
  message,
  traces,
});

function assertPortions(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/**
 * Plans the weekly production: pre-checks, min-cost LP, max-protein LP at that
 * cost, largest remainder rounding and post-rounding verification.
 */
export function planProduction(input: PlanInput): PlanResult {
  assertPortions('totalPortions', input.totalPortions);
  assertPortions('glutenFreePortions', input.glutenFreePortions);
  const settings: ProductionSettings = { ...DEFAULT_PRODUCTION_SETTINGS, ...input.settings };
  const D = input.totalPortions;

  if (D === 0) return fail('no-orders', MESSAGES.noOrders);
  if (input.glutenFreePortions > D) return fail('gluten-exceeds-total', MESSAGES.glutenExceedsTotal);

  const blocked = new Set(input.blockedCodes ?? []);
  const active = input.recipes.filter((r: Recipe) => !blocked.has(r.code));
  if (active.length * settings.maxShare < 1 - 1e-9) return fail('infeasible', MESSAGES.noSolution);

  const model: ModelInput = {
    recipes: active,
    totalPortions: D,
    glutenFreePortions: input.glutenFreePortions,
    chickenCapG: input.chickenCapG,
    beefCapG: input.beefCapG,
    settings,
  };

  const first = solveSimplex(buildCostModel(model));
  if (first.status !== 'optimal' || first.objectiveValue === null) {
    return fail('infeasible', MESSAGES.noSolution, { costModel: first.trace, proteinModel: null });
  }

  let second: SimplexResult = solveSimplex(buildProteinModel(model, first.objectiveValue));
  if (second.status !== 'optimal') second = solveSimplex(buildProteinModel(model, first.objectiveValue, true));
  const chosen = second.status === 'optimal' ? second : first;

  const continuous = active.map((r, i) => ({ code: r.code, portions: chosen.solution[i] ?? 0 }));
  const continuousCost = active.reduce((sum, r, i) => sum + r.cost * (chosen.solution[i] ?? 0), 0);

  const { rows, remainder } = distributeLargestRemainder(
    continuous.map((c) => ({ code: c.code, value: c.portions })),
    D,
  );
  const integer = rows.map((r) => ({ code: r.code, portions: r.final }));
  const check = verifyIntegerPlan({
    recipes: active,
    portionsByCode: Object.fromEntries(integer.map((p) => [p.code, p.portions])),
    totalPortions: D,
    chickenCapG: input.chickenCapG,
    beefCapG: input.beefCapG,
    settings,
  });

  return {
    status: 'optimal',
    continuous,
    continuousCost,
    rounding: rows,
    remainder,
    integer,
    integerCost: check.cost,
    integerCostCents: check.costCents,
    avgKcal: check.avgKcal,
    avgProtein: check.avgProtein,
    capUsage: check.capUsage,
    warnings: check.warnings,
    traces: { costModel: first.trace, proteinModel: second.status === 'optimal' ? second.trace : null },
  };
}
