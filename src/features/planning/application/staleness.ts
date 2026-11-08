import type { Order } from '@/features/orders/domain/order';
import type { ChangeSummary } from '@/features/history/application/ChangeService';
import type { PlanInput } from '../domain/planProduction';
import type { PlanRecord } from '../domain/planRecord';
import { buildPlanInput, hashPlanInput, type PlanningState } from './buildPlanInput';

/** What the next plan of any week would be built from, without orders (see {@link isPlanAffected}). */
export type PlanningConfig = Omit<PlanningState, 'orders'>;

const contribution = (order: Order | null): { portions: number; gluten: number } =>
  order && order.status === 'confirmed'
    ? { portions: order.portions, gluten: order.glutenFree ? order.portions : 0 }
    : { portions: 0, gluten: 0 };

function orderAffects(record: PlanRecord, change: ChangeSummary): boolean {
  const before = change.before as Order | null;
  const after = change.after as Order | null;
  const weeks = new Set([before?.weekId, after?.weekId]);
  if (!weeks.has(record.weekId)) return false;
  const was = before?.weekId === record.weekId ? contribution(before) : contribution(null);
  const now = after?.weekId === record.weekId ? contribution(after) : contribution(null);
  return was.portions !== now.portions || was.gluten !== now.gluten;
}

/** The recipe name is cosmetic: renaming a recipe never makes a plan stale. */
const withoutNames = (input: PlanInput): PlanInput => ({
  ...input,
  recipes: input.recipes.map((recipe) => ({ ...recipe, name: '' })),
});

/**
 * Recipes, settings and menus: rebuild the input the NEXT plan of the week would
 * use (inactive or missing recipes dropped, menu caps falling back to the settings
 * caps, previous-week rotation, production bands) and compare it with the stored
 * one. Orders do not depend on these entities, so the stored D and G are reused.
 */
function configAffects(record: PlanRecord, config: PlanningConfig): boolean {
  const { input } = buildPlanInput(record.weekId, { ...config, orders: [] });
  const next = { ...input, totalPortions: record.input.totalPortions, glutenFreePortions: record.input.glutenFreePortions };
  return hashPlanInput(withoutNames(next)) !== hashPlanInput(withoutNames(record.input));
}

/** True when the change alters something the stored plan was computed from. `config` is read AFTER the change. */
export function isPlanAffected(record: PlanRecord, change: ChangeSummary, config: PlanningConfig): boolean {
  return change.entity === 'order' ? orderAffects(record, change) : configAffects(record, config);
}
