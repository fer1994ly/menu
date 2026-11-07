import { formatDecimal, formatTrimmed, roundHalfUp } from '../../../shared/kernel/numberFormat';
import type { ProductionSettings, Recipe } from './types';

export interface CapUsage {
  used: number;
  cap: number;
}

export interface VerificationInput {
  recipes: readonly Recipe[];
  portionsByCode: Readonly<Record<string, number>>;
  totalPortions: number;
  chickenCapG: number;
  beefCapG: number;
  settings: ProductionSettings;
}

export interface Verification {
  costCents: number;
  /** Cost in currency units (exact: derived from integer cents). */
  cost: number;
  /** Average kcal per portion, rounded half-up to 2 decimals. */
  avgKcal: number;
  /** Average protein per portion, rounded half-up to 2 decimals. */
  avgProtein: number;
  capUsage: { chicken: CapUsage; beef: CapUsage };
  /** Non-blocking warnings with the exact briefing texts. */
  warnings: string[];
}

const CAP_EPSILON = 1e-9;

/**
 * Recomputes cost, averages and cap usage with the integer portions and
 * produces the warnings. Averages are compared after rounding to 2 decimals.
 *
 * Message patterns (numbers in Spanish format):
 * - "Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g"
 * - "Kcal promedio 479,50: queda por debajo del mínimo de 480"
 * - "Kcal promedio 546,10: queda por encima del máximo de 545"
 * - "Las porciones enteras superan el tope de pollo (o res) en 40 g"
 */
export function verifyIntegerPlan(input: VerificationInput): Verification {
  const { recipes, portionsByCode, totalPortions, settings } = input;
  let costCents = 0;
  let kcal = 0;
  let protein = 0;
  let chicken = 0;
  let beef = 0;
  for (const r of recipes) {
    const n = portionsByCode[r.code] ?? 0;
    costCents += Math.round(r.cost * 100) * n;
    kcal += r.kcal * n;
    protein += r.protein * n;
    chicken += r.chickenG * n;
    beef += r.beefG * n;
  }
  const avgKcal = totalPortions > 0 ? roundHalfUp(kcal / totalPortions, 2) : 0;
  const avgProtein = totalPortions > 0 ? roundHalfUp(protein / totalPortions, 2) : 0;

  const warnings: string[] = [];
  if (totalPortions > 0) {
    if (avgProtein < settings.proteinMin) {
      warnings.push(
        `Proteína promedio ${formatDecimal(avgProtein, 2)} g: queda por debajo del mínimo de ${formatTrimmed(settings.proteinMin)} g`,
      );
    }
    if (avgKcal < settings.kcalMin) {
      warnings.push(
        `Kcal promedio ${formatDecimal(avgKcal, 2)}: queda por debajo del mínimo de ${formatTrimmed(settings.kcalMin)}`,
      );
    }
    if (avgKcal > settings.kcalMax) {
      warnings.push(
        `Kcal promedio ${formatDecimal(avgKcal, 2)}: queda por encima del máximo de ${formatTrimmed(settings.kcalMax)}`,
      );
    }
  }
  if (chicken > input.chickenCapG + CAP_EPSILON) {
    warnings.push(`Las porciones enteras superan el tope de pollo en ${formatTrimmed(chicken - input.chickenCapG)} g`);
  }
  if (beef > input.beefCapG + CAP_EPSILON) {
    warnings.push(`Las porciones enteras superan el tope de res en ${formatTrimmed(beef - input.beefCapG)} g`);
  }

  return {
    costCents,
    cost: costCents / 100,
    avgKcal,
    avgProtein,
    capUsage: {
      chicken: { used: chicken, cap: input.chickenCapG },
      beef: { used: beef, cap: input.beefCapG },
    },
    warnings,
  };
}
