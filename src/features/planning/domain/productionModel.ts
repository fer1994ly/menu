import type { LpProblem } from './simplex';
import type { ProductionSettings, Recipe } from './types';

export interface ModelInput {
  /** Active recipes only (rotation already applied). */
  recipes: readonly Recipe[];
  totalPortions: number;
  glutenFreePortions: number;
  chickenCapG: number;
  beefCapG: number;
  settings: ProductionSettings;
}

const coefficients = (recipes: readonly Recipe[], pick: (r: Recipe) => number): number[] => recipes.map(pick);

/**
 * Cost model: minimise sum(cost_r x_r) subject to the briefing constraints.
 * Variables are x_<code>, portions to produce of each active recipe.
 */
export function buildCostModel(input: ModelInput): LpProblem {
  const { recipes, totalPortions: D, glutenFreePortions: G, settings } = input;
  const unit = (i: number) => recipes.map((_, j) => (i === j ? 1 : 0));
  const constraints: LpProblem['constraints'] = [
    { label: 'total', coefficients: recipes.map(() => 1), sense: '=', rhs: D },
  ];
  recipes.forEach((r, i) => {
    constraints.push({ label: `min:${r.code}`, coefficients: unit(i), sense: '>=', rhs: settings.minShare * D });
    constraints.push({ label: `max:${r.code}`, coefficients: unit(i), sense: '<=', rhs: settings.maxShare * D });
  });
  constraints.push(
    { label: 'kcalMin', coefficients: coefficients(recipes, (r) => r.kcal), sense: '>=', rhs: settings.kcalMin * D },
    { label: 'kcalMax', coefficients: coefficients(recipes, (r) => r.kcal), sense: '<=', rhs: settings.kcalMax * D },
    { label: 'proteinMin', coefficients: coefficients(recipes, (r) => r.protein), sense: '>=', rhs: settings.proteinMin * D },
    { label: 'chickenCap', coefficients: coefficients(recipes, (r) => r.chickenG), sense: '<=', rhs: input.chickenCapG },
    { label: 'beefCap', coefficients: coefficients(recipes, (r) => r.beefG), sense: '<=', rhs: input.beefCapG },
  );
  if (G > 0) {
    constraints.push({
      label: 'glutenFree',
      coefficients: coefficients(recipes, (r) => (r.glutenFree ? 1 : 0)),
      sense: '>=',
      rhs: G,
    });
  }
  return {
    variableNames: recipes.map((r) => `x_${r.code}`),
    objective: coefficients(recipes, (r) => r.cost),
    constraints,
  };
}

/**
 * Tie-break model: same constraints plus cost = optimum, maximising total
 * protein (expressed as minimising its negative). `relaxed` replaces the
 * equality by cost <= optimum + 1e-7 * scale, used only if floating error makes
 * the exact equality look infeasible.
 */
export function buildProteinModel(input: ModelInput, optimumCost: number, relaxed = false): LpProblem {
  const base = buildCostModel(input);
  const tolerance = 1e-7 * Math.max(1, Math.abs(optimumCost));
  return {
    ...base,
    objective: coefficients(input.recipes, (r) => -r.protein),
    constraints: [
      ...base.constraints,
      {
        label: 'costOptimum',
        coefficients: base.objective,
        sense: relaxed ? '<=' : '=',
        rhs: relaxed ? optimumCost + tolerance : optimumCost,
      },
    ],
  };
}
