/** Recipes served in one week plus the raw-material caps decided for it. */
export interface WeekMenu {
  /** Delivery Sunday (`YYYY-MM-DD`). */
  weekId: string;
  recipeCodes: string[];
  /** Weekly chicken cap in grams. Falls back to the settings value when absent. */
  chickenCapG?: number;
  /** Weekly beef cap in grams. Falls back to the settings value when absent. */
  beefCapG?: number;
}
