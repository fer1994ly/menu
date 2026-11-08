import type { Settings } from '@/features/admin/domain/settings';
import type { Order } from '@/features/orders/domain/order';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import { previousWeekId } from '@/shared/kernel/time';
import type { WeekMenu } from '../domain/menu';
import type { PlanInput } from '../domain/planProduction';
import type { CapSource } from '../domain/planRecord';
import type { Recipe } from '../domain/types';

/** Everything the plan of a week is derived from. */
export interface PlanningState {
  /** At least the orders of the week; others are ignored. */
  orders: readonly Order[];
  recipes: readonly RecipeEntity[];
  menus: readonly WeekMenu[];
  settings: Settings;
}

export interface BuiltPlanInput {
  input: PlanInput;
  capSource: { chicken: CapSource; beef: CapSource };
}

const toPlanRecipe = (r: RecipeEntity): Recipe => ({
  code: r.code,
  name: r.name,
  kcal: r.kcal,
  protein: r.protein,
  cost: r.cost,
  chickenG: r.chickenG,
  beefG: r.beefG,
  glutenFree: r.glutenFree,
});

/**
 * D = portions of the confirmed orders of the week, G = portions of the
 * gluten-free ones, recipes = the week menu (active recipes), blocked = the
 * previous week menu, caps = week menu or settings, production = settings.
 */
export function buildPlanInput(weekId: string, state: PlanningState): BuiltPlanInput {
  let totalPortions = 0;
  let glutenFreePortions = 0;
  for (const order of state.orders) {
    if (order.weekId !== weekId || order.status !== 'confirmed') continue;
    totalPortions += order.portions;
    if (order.glutenFree) glutenFreePortions += order.portions;
  }

  const menu = state.menus.find((m) => m.weekId === weekId);
  const previous = state.menus.find((m) => m.weekId === previousWeekId(weekId));
  const byCode = new Map(state.recipes.map((r) => [r.code, r] as const));
  const recipes = (menu?.recipeCodes ?? [])
    .map((code) => byCode.get(code))
    .filter((r): r is RecipeEntity => r !== undefined && r.active)
    .map(toPlanRecipe);

  const { settings } = state;
  const input: PlanInput = {
    recipes,
    blockedCodes: [...(previous?.recipeCodes ?? [])],
    totalPortions,
    glutenFreePortions,
    chickenCapG: menu?.chickenCapG ?? settings.chickenCapG,
    beefCapG: menu?.beefCapG ?? settings.beefCapG,
    settings: {
      minShare: settings.minShare,
      maxShare: settings.maxShare,
      kcalMin: settings.kcalMin,
      kcalMax: settings.kcalMax,
      proteinMin: settings.proteinMin,
    },
  };
  return {
    input,
    capSource: {
      chicken: menu?.chickenCapG === undefined ? 'settings' : 'menu',
      beef: menu?.beefCapG === undefined ? 'settings' : 'menu',
    },
  };
}

/** Stable FNV-1a hash of the input, to tell whether a stored plan is still current. */
export function hashPlanInput(input: PlanInput): string {
  const text = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
