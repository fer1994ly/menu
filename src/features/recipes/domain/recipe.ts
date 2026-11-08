import type { Recipe } from '@/features/planning/domain/types';

/** Recipe as managed in the recipe book: the planning recipe plus book metadata. */
export interface RecipeEntity extends Recipe {
  /** Delivery Sunday (`YYYY-MM-DD`) of the last week the recipe was served. */
  lastServedWeek?: string;
  /** Inactive recipes are left out of the production model. */
  active: boolean;
}

/** Editable fields of a recipe (what a form submits). */
export type RecipeInput = Pick<Recipe, 'code' | 'name' | 'kcal' | 'protein' | 'cost' | 'chickenG' | 'beefG' | 'glutenFree'>;

export type RecipeField = 'code' | 'name' | 'kcal' | 'protein' | 'cost' | 'chickenG' | 'beefG';
export type RecipeErrors = Partial<Record<RecipeField, string>>;

export const RECIPE_MESSAGES = {
  outOfRange: 'Valor fuera de rango',
  required: 'Campo obligatorio',
} as const;

/**
 * Sanity upper bounds (values above are almost certainly typos):
 * kcal ≤ 5000, protein ≤ 500 g, cost ≤ 10000, grams of chicken/beef ≤ 5000.
 */
export const RECIPE_UPPER_BOUNDS = { kcal: 5000, protein: 500, cost: 10000, grams: 5000 } as const;

const isNumber = (value: number): boolean => Number.isFinite(value);

/**
 * Field errors for a recipe; an empty object means it can be saved.
 * cost > 0, kcal > 0, protein ≥ 0, grams ≥ 0 (zero is valid: R5 has no chicken or beef).
 */
export function validateRecipe(input: RecipeInput): RecipeErrors {
  const errors: RecipeErrors = {};
  if (input.code.trim() === '') errors.code = RECIPE_MESSAGES.required;
  if (input.name.trim() === '') errors.name = RECIPE_MESSAGES.required;

  const { kcal, protein, cost, grams } = RECIPE_UPPER_BOUNDS;
  if (!isNumber(input.kcal) || input.kcal <= 0 || input.kcal > kcal) errors.kcal = RECIPE_MESSAGES.outOfRange;
  if (!isNumber(input.protein) || input.protein < 0 || input.protein > protein) errors.protein = RECIPE_MESSAGES.outOfRange;
  if (!isNumber(input.cost) || input.cost <= 0 || input.cost > cost) errors.cost = RECIPE_MESSAGES.outOfRange;
  if (!isNumber(input.chickenG) || input.chickenG < 0 || input.chickenG > grams) errors.chickenG = RECIPE_MESSAGES.outOfRange;
  if (!isNumber(input.beefG) || input.beefG < 0 || input.beefG > grams) errors.beefG = RECIPE_MESSAGES.outOfRange;
  return errors;
}

export const hasRecipeErrors = (errors: RecipeErrors): boolean => Object.keys(errors).length > 0;
