export interface Recipe {
  code: string;
  name: string;
  kcal: number;
  /** Grams of protein per portion. */
  protein: number;
  /** Cost per portion (currency units, up to 2 decimals). */
  cost: number;
  chickenG: number;
  beefG: number;
  glutenFree: boolean;
}

export interface ProductionSettings {
  /** Minimum share of D for every active recipe (0.10 = 10 %). */
  minShare: number;
  /** Maximum share of D for every active recipe (0.30 = 30 %). */
  maxShare: number;
  kcalMin: number;
  kcalMax: number;
  proteinMin: number;
}

export const DEFAULT_PRODUCTION_SETTINGS: ProductionSettings = {
  minShare: 0.1,
  maxShare: 0.3,
  kcalMin: 480,
  kcalMax: 545,
  proteinMin: 37,
};

export interface RecipePortions {
  code: string;
  portions: number;
}

export const MESSAGES = {
  noOrders: 'Todavía no hay pedidos cerrados para esta semana',
  glutenExceedsTotal: 'Hay más porciones sin gluten que porciones totales: revisá los pedidos',
  noSolution:
    'No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.',
} as const;
