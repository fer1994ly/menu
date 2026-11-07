import { describe, expect, it } from 'vitest';
import { buildShoppingList, DEFAULT_SHOPPING_CONFIG } from '../shoppingList';

const recipes = [
  { code: 'R1', chickenG: 180, beefG: 0 },
  { code: 'R2', chickenG: 0, beefG: 160 },
];

describe('buildShoppingList', () => {
  it('computes grams, packages, cost and leftover per input', () => {
    const list = buildShoppingList(recipes, { R1: 10, R2: 5 });
    // chicken 1.800 g -> 1 package of 2.000 g, leftover 200 g
    expect(list.chicken).toEqual({
      grams: 1800,
      packages: 1,
      packageSizeG: 2000,
      costCents: 29800,
      leftoverGrams: 200,
    });
    // beef 800 g -> 1 package of 1.000 g, leftover 200 g
    expect(list.beef.packages).toBe(1);
    expect(list.beef.leftoverGrams).toBe(200);
    expect(list.totalCostCents).toBe(29800 + 21900);
  });

  it('does not buy an extra package on an exact multiple', () => {
    const list = buildShoppingList([{ code: 'R1', chickenG: 200, beefG: 0 }], { R1: 130 });
    expect(list.chicken.grams).toBe(26000);
    expect(list.chicken.packages).toBe(13);
    expect(list.chicken.leftoverGrams).toBe(0);
  });

  it('buys nothing when no grams are needed', () => {
    const list = buildShoppingList(recipes, {});
    expect(list.chicken.packages).toBe(0);
    expect(list.chicken.costCents).toBe(0);
    expect(list.totalCostCents).toBe(0);
  });

  it('accepts custom package sizes and prices', () => {
    const list = buildShoppingList(recipes, { R1: 10 }, {
      chicken: { packageSizeG: 500, priceCents: 5000 },
      beef: DEFAULT_SHOPPING_CONFIG.beef,
    });
    expect(list.chicken.packages).toBe(4);
    expect(list.chicken.costCents).toBe(20000);
    expect(list.chicken.leftoverGrams).toBe(200);
  });

  it('ignores portions of unknown recipes', () => {
    expect(buildShoppingList(recipes, { R9: 4 }).chicken.grams).toBe(0);
  });

  it('rejects invalid package configuration', () => {
    expect(() =>
      buildShoppingList(recipes, {}, {
        chicken: { packageSizeG: 0, priceCents: 1 },
        beef: DEFAULT_SHOPPING_CONFIG.beef,
      }),
    ).toThrow();
  });
});
