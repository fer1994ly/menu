import type { Recipe } from '../types';

/** The six sample recipes of the briefing catalog. */
export const TEST_RECIPES: Recipe[] = [
  { code: 'R1', name: 'Pollo a la mostaza con arroz', kcal: 520, protein: 42, cost: 48.5, chickenG: 180, beefG: 0, glutenFree: true },
  { code: 'R2', name: 'Picadillo de res con verduras', kcal: 480, protein: 35, cost: 56, chickenG: 0, beefG: 160, glutenFree: true },
  { code: 'R3', name: 'Pasta integral a la boloñesa', kcal: 610, protein: 33, cost: 41, chickenG: 0, beefG: 110, glutenFree: false },
  { code: 'R4', name: 'Tinga de pollo con frijoles', kcal: 550, protein: 38, cost: 39.5, chickenG: 140, beefG: 0, glutenFree: true },
  { code: 'R5', name: 'Salmón teriyaki con quinoa', kcal: 500, protein: 34, cost: 89, chickenG: 0, beefG: 0, glutenFree: false },
  { code: 'R6', name: 'Enchiladas verdes de pollo', kcal: 590, protein: 36, cost: 37, chickenG: 120, beefG: 0, glutenFree: true },
];

/** Deterministic PRNG for property-style tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
