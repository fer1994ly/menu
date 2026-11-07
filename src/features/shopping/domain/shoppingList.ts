/**
 * Shopping math: grams needed per input, packages (ceil, exact multiples do not
 * add a package), cost and leftover. Money is handled in integer cents.
 */

export interface PackageConfig {
  packageSizeG: number;
  /** Price of one package, in cents. */
  priceCents: number;
}

export interface ShoppingConfig {
  chicken: PackageConfig;
  beef: PackageConfig;
}

export const DEFAULT_SHOPPING_CONFIG: ShoppingConfig = {
  chicken: { packageSizeG: 2000, priceCents: 29800 },
  beef: { packageSizeG: 1000, priceCents: 21900 },
};

/** Minimal recipe shape needed by the shopping list. */
export interface ShoppingRecipe {
  code: string;
  chickenG: number;
  beefG: number;
}

export interface ShoppingLine {
  grams: number;
  packages: number;
  packageSizeG: number;
  costCents: number;
  leftoverGrams: number;
}

export interface ShoppingList {
  chicken: ShoppingLine;
  beef: ShoppingLine;
  totalCostCents: number;
}

function buildLine(grams: number, config: PackageConfig): ShoppingLine {
  if (!(config.packageSizeG > 0)) throw new Error('Package size must be positive');
  const exactPackages = Math.round((grams / config.packageSizeG) * 1e9) / 1e9;
  const packages = Math.ceil(exactPackages);
  return {
    grams,
    packages,
    packageSizeG: config.packageSizeG,
    costCents: packages * config.priceCents,
    leftoverGrams: packages * config.packageSizeG - grams,
  };
}

export function buildShoppingList(
  recipes: readonly ShoppingRecipe[],
  portionsByCode: Readonly<Record<string, number>>,
  config: ShoppingConfig = DEFAULT_SHOPPING_CONFIG,
): ShoppingList {
  let chickenG = 0;
  let beefG = 0;
  for (const recipe of recipes) {
    const portions = portionsByCode[recipe.code] ?? 0;
    chickenG += recipe.chickenG * portions;
    beefG += recipe.beefG * portions;
  }
  const chicken = buildLine(chickenG, config.chicken);
  const beef = buildLine(beefG, config.beef);
  return { chicken, beef, totalCostCents: chicken.costCents + beef.costCents };
}
