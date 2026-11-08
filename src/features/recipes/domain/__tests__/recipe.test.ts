import { describe, expect, it } from 'vitest';
import { hasRecipeErrors, RECIPE_MESSAGES, validateRecipe, type RecipeInput } from '../recipe';

const valid: RecipeInput = {
  code: 'R1',
  name: 'Pollo a la mostaza con arroz',
  kcal: 520,
  protein: 42,
  cost: 48.5,
  chickenG: 180,
  beefG: 0,
  glutenFree: true,
};

describe('validateRecipe', () => {
  it('accepts a valid recipe, including zero protein and zero grams', () => {
    expect(validateRecipe(valid)).toEqual({});
    expect(hasRecipeErrors(validateRecipe({ ...valid, protein: 0, chickenG: 0, beefG: 0 }))).toBe(false);
  });

  it('marks cost <= 0 as out of range', () => {
    expect(validateRecipe({ ...valid, cost: 0 })).toEqual({ cost: 'Valor fuera de rango' });
    expect(validateRecipe({ ...valid, cost: -1 }).cost).toBe(RECIPE_MESSAGES.outOfRange);
  });

  it('marks kcal <= 0 as out of range', () => {
    expect(validateRecipe({ ...valid, kcal: 0 })).toEqual({ kcal: 'Valor fuera de rango' });
    expect(validateRecipe({ ...valid, kcal: -5 }).kcal).toBe('Valor fuera de rango');
  });

  it('marks negative protein and negative grams as out of range', () => {
    expect(validateRecipe({ ...valid, protein: -0.1 })).toEqual({ protein: 'Valor fuera de rango' });
    expect(validateRecipe({ ...valid, chickenG: -1, beefG: -2 })).toEqual({
      chickenG: 'Valor fuera de rango',
      beefG: 'Valor fuera de rango',
    });
  });

  it('rejects non-finite numbers and documented upper bounds', () => {
    expect(validateRecipe({ ...valid, kcal: Number.NaN }).kcal).toBe('Valor fuera de rango');
    expect(validateRecipe({ ...valid, cost: Number.POSITIVE_INFINITY }).cost).toBe('Valor fuera de rango');
    expect(validateRecipe({ ...valid, kcal: 5001 }).kcal).toBe('Valor fuera de rango');
    expect(validateRecipe({ ...valid, protein: 501 }).protein).toBe('Valor fuera de rango');
    expect(validateRecipe({ ...valid, cost: 10001 }).cost).toBe('Valor fuera de rango');
    expect(validateRecipe({ ...valid, beefG: 5001 }).beefG).toBe('Valor fuera de rango');
  });

  it('requires code and name', () => {
    expect(validateRecipe({ ...valid, code: '  ', name: '' })).toEqual({
      code: 'Campo obligatorio',
      name: 'Campo obligatorio',
    });
  });
});
