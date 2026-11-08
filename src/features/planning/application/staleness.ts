import type { Settings } from '@/features/admin/domain/settings';
import type { Order } from '@/features/orders/domain/order';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import { nextWeekId } from '@/shared/kernel/time';
import type { ChangeSummary } from '@/features/history/application/ChangeService';
import type { WeekMenu } from '../domain/menu';
import type { PlanRecord } from '../domain/planRecord';
import type { Recipe } from '../domain/types';

const RECIPE_FIELDS = ['kcal', 'protein', 'cost', 'chickenG', 'beefG', 'glutenFree'] as const;
const PRODUCTION_FIELDS = ['minShare', 'maxShare', 'kcalMin', 'kcalMax', 'proteinMin'] as const;

function recipeAffects(record: PlanRecord, change: ChangeSummary): boolean {
  const used: Recipe | undefined = record.input.recipes.find((r) => r.code === change.entityId);
  if (!used) return false;
  const after = change.after as RecipeEntity | null;
  if (after === null || !after.active) return true;
  return RECIPE_FIELDS.some((field) => used[field] !== after[field]);
}

function settingsAffects(record: PlanRecord, change: ChangeSummary): boolean {
  const after = change.after as Settings;
  const used = record.input.settings ?? {};
  if (PRODUCTION_FIELDS.some((field) => used[field] !== undefined && used[field] !== after[field])) return true;
  if (record.capSource.chicken === 'settings' && record.input.chickenCapG !== after.chickenCapG) return true;
  return record.capSource.beef === 'settings' && record.input.beefCapG !== after.beefCapG;
}

function menuAffects(record: PlanRecord, change: ChangeSummary): boolean {
  const after = change.after as WeekMenu | null;
  if (change.entityId === record.weekId) {
    const codes = new Set(after?.recipeCodes ?? []);
    const used = record.input.recipes.map((r) => r.code);
    if (used.length !== codes.size || used.some((code) => !codes.has(code))) return true;
    const chicken = after?.chickenCapG ?? record.input.chickenCapG;
    const beef = after?.beefCapG ?? record.input.beefCapG;
    return chicken !== record.input.chickenCapG || beef !== record.input.beefCapG;
  }
  if (nextWeekId(change.entityId) === record.weekId) {
    // The menu of the previous week feeds the rotation of this one.
    const blocked = new Set(record.input.blockedCodes ?? []);
    const next = new Set(after?.recipeCodes ?? []);
    return blocked.size !== next.size || [...next].some((code) => !blocked.has(code));
  }
  return false;
}

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

/** True when the change alters something the stored plan was computed from. */
export function isPlanAffected(record: PlanRecord, change: ChangeSummary): boolean {
  switch (change.entity) {
    case 'recipe':
      return recipeAffects(record, change);
    case 'settings':
      return settingsAffects(record, change);
    case 'menu':
      return menuAffects(record, change);
    case 'order':
      return orderAffects(record, change);
  }
}
