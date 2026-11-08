import { closeInstantForWeek, previousWeekId, weekIdForInstant } from '@/shared/kernel/time';
import { EXTENDED_RECIPE_NAMES } from '../../domain/catalog';
import { generateSeed, SEED_RNG_SEED, type SeedData } from '../generateSeed';

// Friday 2026-11-13 10:00 Monterrey (UTC-6): the current week still accepts orders.
const NOW = Date.UTC(2026, 10, 13, 16, 0, 0);

describe('generateSeed', () => {
  let seed: SeedData;
  let elapsedMs = 0;
  beforeAll(() => {
    const started = performance.now();
    seed = generateSeed(NOW);
    elapsedMs = performance.now() - started;
  });

  it('uses the briefing fixed seed', () => {
    expect(SEED_RNG_SEED).toBe(2604);
  });

  it('is deterministic', () => {
    const again = generateSeed(NOW);
    expect(again.orders.slice(0, 50)).toEqual(seed.orders.slice(0, 50));
    expect(again.menus).toEqual(seed.menus);
    expect(again.plans.map((p) => p.inputsHash)).toEqual(seed.plans.map((p) => p.inputsHash));
  });

  it('creates 2.000 clients and 66 recipes (R1–R66)', () => {
    expect(seed.clients).toHaveLength(2000);
    expect(new Set(seed.clients.map((c) => c.id)).size).toBe(2000);
    expect(EXTENDED_RECIPE_NAMES).toHaveLength(60);
    expect(seed.recipes).toHaveLength(66);
    expect(seed.recipes.map((r) => r.code).slice(0, 7)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
    for (const recipe of seed.recipes.slice(6)) {
      expect(recipe.kcal).toBeGreaterThanOrEqual(380);
      expect(recipe.kcal).toBeLessThanOrEqual(680);
      expect(recipe.protein).toBeGreaterThanOrEqual(22);
      expect(recipe.protein).toBeLessThanOrEqual(48);
      expect(recipe.cost).toBeGreaterThanOrEqual(32);
      expect(recipe.cost).toBeLessThanOrEqual(95);
      expect(recipe.chickenG === 0 || recipe.beefG === 0).toBe(true);
      expect(Math.max(recipe.chickenG, recipe.beefG)).toBeLessThanOrEqual(200);
    }
    expect(seed.recipes.filter((r) => r.chickenG === 0 && r.beefG === 0).length).toBeGreaterThan(20);
    expect(seed.recipes.map((r) => r.name)).toContain('Machacado con huevo y nopales');
  });

  it('creates 52 history weeks with exactly 26.000 orders, 380–620 per week', () => {
    expect(seed.historyWeekIds).toHaveLength(52);
    const history = seed.orders.filter((o) => seed.historyWeekIds.includes(o.weekId));
    expect(history).toHaveLength(26_000);
    for (const weekId of seed.historyWeekIds) {
      const n = history.filter((o) => o.weekId === weekId).length;
      expect(n).toBeGreaterThanOrEqual(380);
      expect(n).toBeLessThanOrEqual(620);
    }
  });

  it('matches the requested mix per week: plans, gluten-free and routes', () => {
    const week = seed.orders.filter((o) => o.weekId === seed.historyWeekIds[10]);
    const share = (pred: (o: (typeof week)[number]) => boolean): number => week.filter(pred).length / week.length;
    expect(share((o) => o.plan === 5)).toBeCloseTo(0.7, 2);
    expect(share((o) => o.glutenFree)).toBeCloseTo(0.06, 2);
    expect(share((o) => o.route === 'open')).toBeCloseTo(0.65, 2);
    expect(share((o) => o.route === 'morning')).toBeCloseTo(0.2, 2);
    expect(share((o) => o.route === 'afternoon')).toBeCloseTo(0.15, 2);
  });

  it('gives every order a timestamp inside its own week and some on Saturday 11:00–11:30', () => {
    for (const order of seed.orders) expect(weekIdForInstant(order.createdAt)).toBe(order.weekId);
    for (const weekId of seed.historyWeekIds) {
      const close = closeInstantForWeek(weekId);
      const late = seed.orders.filter((o) => o.weekId === weekId && o.createdAt >= close - 30 * 60_000 && o.createdAt <= close);
      expect(late.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('plans 6 recipes per history week without repeating the previous week and stores each plan', () => {
    expect(seed.plans).toHaveLength(52);
    for (const [index, weekId] of seed.historyWeekIds.entries()) {
      const menu = seed.menus.find((m) => m.weekId === weekId)!;
      expect(menu.recipeCodes).toHaveLength(6);
      expect(menu.chickenCapG).toBeGreaterThanOrEqual(20_000);
      expect(menu.chickenCapG).toBeLessThanOrEqual(40_000);
      expect(menu.beefCapG).toBeGreaterThanOrEqual(12_000);
      expect(menu.beefCapG).toBeLessThanOrEqual(25_000);
      if (index > 0) {
        const previous = seed.menus.find((m) => m.weekId === previousWeekId(weekId))!;
        expect(menu.recipeCodes.filter((code) => previous.recipeCodes.includes(code))).toEqual([]);
      }
      const plan = seed.plans.find((p) => p.weekId === weekId)!;
      expect(['optimal', 'infeasible']).toContain(plan.status);
    }
    const feasible = seed.plans.filter((p) => p.status === 'optimal').length;
    expect(feasible).toBeGreaterThanOrEqual(25);
  });

  it('builds the briefing scenario for the current week', () => {
    const current = seed.currentWeekId;
    expect(current).toBe(weekIdForInstant(NOW));
    const orders = seed.orders.filter((o) => o.weekId === current);
    expect(orders).toHaveLength(50);
    expect(orders.filter((o) => o.plan === 5)).toHaveLength(40);
    expect(orders.filter((o) => o.plan === 10)).toHaveLength(10);
    expect(orders.reduce((sum, o) => sum + o.portions, 0)).toBe(300);
    const gluten = orders.filter((o) => o.glutenFree);
    expect(gluten).toHaveLength(5);
    expect(gluten.every((o) => o.plan === 5)).toBe(true);
    expect(orders.filter((o) => o.route === 'open').length).toBeLessThanOrEqual(90);
    expect(orders.filter((o) => o.route === 'morning').length).toBeLessThanOrEqual(30);
    expect(Math.max(...orders.map((o) => o.createdAt))).toBeLessThanOrEqual(NOW);
    const menu = seed.menus.find((m) => m.weekId === current)!;
    expect(menu).toMatchObject({ recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 26_000, beefCapG: 20_000 });
    const previous = seed.menus.find((m) => m.weekId === previousWeekId(current))!;
    expect(previous.recipeCodes.some((code) => ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].includes(code))).toBe(false);
    expect(seed.plans.some((p) => p.weekId === current)).toBe(false);
  });

  it('generates in a reasonable time', () => {
    // Generous bound: other workers compete for CPU, so only a hang should fail here.
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
