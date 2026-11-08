import { DEFAULT_SETTINGS, type Settings } from '@/features/admin/domain/settings';
import type { Client } from '@/features/clients/domain/client';
import type { Order, OrderPlan } from '@/features/orders/domain/order';
import { buildPlanInput, hashPlanInput } from '@/features/planning/application/buildPlanInput';
import { runPlanJob, stripTraces } from '@/features/planning/application/planJob';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { PlanOutcome, PlanRecord } from '@/features/planning/domain/planRecord';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import { DEFAULT_ROUTE_CHARGES_CENTS, type RouteId } from '@/features/routes/domain/routes';
import { mulberry32, randomInt, shuffleInPlace } from '@/shared/kernel/random';
import { addDaysToDate, closeInstantForWeek, previousWeekId, weekIdForInstant } from '@/shared/kernel/time';
import { BRIEFING_RECIPES, EXTENDED_RECIPE_NAMES, FIRST_NAMES, LAST_NAMES } from '../domain/catalog';

export const SEED_RNG_SEED = 2604;
export const SEED_VERSION = 1;
export const HISTORY_WEEKS = 52;
export const HISTORY_ORDER_TOTAL = 26_000;
export const CLIENT_COUNT = 2000;
export const MENU_SEARCH_ATTEMPTS = 200;

const MIN_WEEK_ORDERS = 380;
const MAX_WEEK_ORDERS = 620;
const MENU_SIZE = 6;
const LATE_WINDOW_MS = 30 * 60_000;

export interface SeedData {
  clients: Client[];
  recipes: RecipeEntity[];
  settings: Settings;
  menus: WeekMenu[];
  orders: Order[];
  /** Plans of the 52 history weeks. The current week is calculated by the user. */
  plans: PlanRecord[];
  currentWeekId: string;
  /** Oldest first. */
  historyWeekIds: string[];
}

type Rng = () => number;

const pad = (n: number): string => String(n).padStart(6, '0');
const round2 = (value: number): number => Math.round(value * 100) / 100;

function generateClients(rng: Rng): Client[] {
  const used = new Set<string>();
  const clients: Client[] = [];
  for (let i = 1; i <= CLIENT_COUNT; i += 1) {
    let name = '';
    do {
      const first = FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)] as string;
      const last1 = LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)] as string;
      const last2 = LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)] as string;
      name = `${first} ${last1} ${last2}`;
    } while (used.has(name));
    used.add(name);
    const phone = `81 ${randomInt(rng, 1000, 9999)} ${randomInt(rng, 1000, 9999)}`;
    clients.push({ id: `c-${String(i).padStart(4, '0')}`, name, phone });
  }
  return clients;
}

function generateRecipes(rng: Rng): RecipeEntity[] {
  const base: RecipeEntity[] = BRIEFING_RECIPES.map((r) => ({ ...r, active: true }));
  const extended = EXTENDED_RECIPE_NAMES.map(([name, meat], index): RecipeEntity => {
    const grams = randomInt(rng, 8, 20) * 10;
    return {
      code: `R${index + 7}`,
      name,
      kcal: randomInt(rng, 380, 680),
      protein: randomInt(rng, 22, 48),
      cost: round2(32 + Math.floor(rng() * 127) * 0.5),
      chickenG: meat === 'chicken' ? grams : 0,
      beefG: meat === 'beef' ? grams : 0,
      glutenFree: rng() < 0.45,
      active: true,
    };
  });
  return [...base, ...extended];
}

/** Counts per week that add up to the total, each inside [min, max]. */
function weeklyCounts(rng: Rng): number[] {
  const counts = Array.from({ length: HISTORY_WEEKS }, () => HISTORY_ORDER_TOTAL / HISTORY_WEEKS);
  for (let i = 0; i < 400; i += 1) {
    const from = randomInt(rng, 0, HISTORY_WEEKS - 1);
    const to = randomInt(rng, 0, HISTORY_WEEKS - 1);
    const delta = randomInt(rng, 1, 40);
    if (from === to) continue;
    const a = counts[from] as number;
    const b = counts[to] as number;
    if (a - delta < MIN_WEEK_ORDERS || b + delta > MAX_WEEK_ORDERS) continue;
    counts[from] = a - delta;
    counts[to] = b + delta;
  }
  return counts;
}

interface OrderSpec {
  plan: OrderPlan;
  glutenFree: boolean;
  route: RouteId;
}

/** Exact mix for the week: shares are rounded to whole orders, then shuffled independently. */
function orderSpecs(count: number, rng: Rng): OrderSpec[] {
  const fives = Math.round(count * 0.7);
  const gluten = Math.round(count * 0.06);
  const open = Math.round(count * 0.65);
  const morning = Math.round(count * 0.2);
  const plans = shuffleInPlace(Array.from({ length: count }, (_, i): OrderPlan => (i < fives ? 5 : 10)), rng);
  const glutenFlags = shuffleInPlace(Array.from({ length: count }, (_, i) => i < gluten), rng);
  const routes = shuffleInPlace(
    Array.from({ length: count }, (_, i): RouteId => (i < open ? 'open' : i < open + morning ? 'morning' : 'afternoon')),
    rng,
  );
  return plans.map((plan, i) => ({ plan, glutenFree: glutenFlags[i] as boolean, route: routes[i] as RouteId }));
}

function makeOrder(
  number: number,
  weekId: string,
  spec: OrderSpec,
  createdAt: number,
  client: Client,
): Order {
  return {
    id: `o-${pad(number)}`,
    code: `P-${pad(number)}`,
    clientId: client.id,
    clientName: client.name,
    plan: spec.plan,
    portions: spec.plan,
    glutenFree: spec.glutenFree,
    route: spec.route,
    weekId,
    status: 'confirmed',
    routeChargeCents: DEFAULT_ROUTE_CHARGES_CENTS[spec.route],
    createdAt,
    updatedAt: createdAt,
    version: 1,
  };
}

/**
 * Timestamps of a week: the intake window is (previous close, close]. A handful of
 * orders land on Saturday between 11:00 and the close so «estado al…» 11:00 differs.
 */
function weekTimestamps(count: number, weekId: string, upTo: number, rng: Rng): number[] {
  const close = closeInstantForWeek(weekId);
  const start = closeInstantForWeek(previousWeekId(weekId)) + 1000;
  const end = Math.min(upTo, close);
  const stamps: number[] = [];
  const lateStart = close - LATE_WINDOW_MS;
  const lateCount = end >= lateStart ? Math.min(count, randomInt(rng, 3, 6)) : 0;
  for (let i = 0; i < lateCount; i += 1) {
    const from = Math.max(start, lateStart);
    stamps.push(from + Math.floor(rng() * (end - from + 1)));
  }
  const bodyEnd = Math.min(end, lateStart - 1);
  for (let i = lateCount; i < count; i += 1) stamps.push(start + Math.floor(rng() * (Math.max(start, bodyEnd) - start + 1)));
  return stamps.sort((a, b) => a - b);
}

interface MenuChoice {
  menu: WeekMenu;
  outcome: PlanOutcome;
}

/**
 * Deterministic search (up to 200 attempts) for a 6-recipe menu that does not
 * repeat the previous week and is feasible under the week caps. When none is
 * feasible the last attempt is stored with its no-solution plan.
 */
function chooseMenu(
  weekId: string,
  orders: readonly Order[],
  recipes: readonly RecipeEntity[],
  previousCodes: readonly string[],
  excludedCodes: readonly string[],
  rng: Rng,
): MenuChoice {
  const pool = recipes.map((r) => r.code).filter((code) => !previousCodes.includes(code) && !excludedCodes.includes(code));
  const chickenCapG = randomInt(rng, 20, 40) * 1000;
  const beefCapG = randomInt(rng, 12, 25) * 1000;
  const totals = buildPlanInput(weekId, { orders, recipes: [], menus: [], settings: DEFAULT_SETTINGS }).input;

  let last: MenuChoice | null = null;
  for (let attempt = 0; attempt < MENU_SEARCH_ATTEMPTS; attempt += 1) {
    const recipeCodes = shuffleInPlace([...pool], rng)
      .slice(0, MENU_SIZE)
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const menu: WeekMenu = { weekId, recipeCodes, chickenCapG, beefCapG };
    const { input } = buildPlanInput(weekId, { orders: [], recipes, menus: [menu], settings: DEFAULT_SETTINGS });
    const withTotals = { ...input, totalPortions: totals.totalPortions, glutenFreePortions: totals.glutenFreePortions };
    const job = runPlanJob({ kind: 'planWeek', input: withTotals });
    if (job.kind !== 'planWeek') throw new Error('unexpected job result');
    last = { menu, outcome: stripTraces(job.result) };
    if (job.result.status === 'optimal') return last;
  }
  return last as MenuChoice;
}

/**
 * Whole sample data set, deterministic for a given `now` (mulberry32 seed 2604).
 *
 * History orders are IMPORTED RECORDS: they are exempt from the 600-portion and
 * route quotas (380–620 orders per week add up to ~3.000 portions, which the
 * quotas would never allow). Quotas apply to orders created through the app and to
 * the current-week scenario below.
 */
export function generateSeed(now: number): SeedData {
  const rng = mulberry32(SEED_RNG_SEED);
  const clients = generateClients(rng);
  const recipes = generateRecipes(rng);
  const currentWeekId = weekIdForInstant(now);
  const historyWeekIds = Array.from({ length: HISTORY_WEEKS }, (_, i) => addDaysToDate(currentWeekId, -7 * (HISTORY_WEEKS - i)));
  const counts = weeklyCounts(rng);
  const briefingCodes = BRIEFING_RECIPES.map((r) => r.code);
  const pickClient = (): Client => clients[randomInt(rng, 0, clients.length - 1)] as Client;

  const orders: Order[] = [];
  const menus: WeekMenu[] = [];
  const plans: PlanRecord[] = [];
  const lastServed = new Map<string, string>();
  let number = 0;
  let previousCodes: string[] = [];

  historyWeekIds.forEach((weekId, index) => {
    const specs = orderSpecs(counts[index] as number, rng);
    const stamps = weekTimestamps(specs.length, weekId, Number.POSITIVE_INFINITY, rng);
    const weekOrders = specs.map((spec, i) => makeOrder(number + i + 1, weekId, spec, stamps[i] as number, pickClient()));
    number += weekOrders.length;
    orders.push(...weekOrders);

    // The week right before the current one must leave R1–R6 free for the briefing scenario.
    const excluded = index === HISTORY_WEEKS - 1 ? briefingCodes : [];
    const choice = chooseMenu(weekId, weekOrders, recipes, previousCodes, excluded, rng);
    menus.push(choice.menu);
    previousCodes = choice.menu.recipeCodes;
    for (const code of choice.menu.recipeCodes) lastServed.set(code, weekId);

    const built = buildPlanInput(weekId, { orders: weekOrders, recipes, menus: menus.slice(-2), settings: DEFAULT_SETTINGS });
    plans.push({
      weekId,
      status: choice.outcome.status,
      outcome: choice.outcome,
      input: built.input,
      capSource: built.capSource,
      inputsHash: hashPlanInput(built.input),
      stale: false,
      computedAt: closeInstantForWeek(weekId),
    });
  });

  // Current week: the briefing scenario (test case 1).
  const specs = currentWeekSpecs(rng);
  const stamps = weekTimestamps(specs.length, currentWeekId, now, rng);
  const current = specs.map((spec, i) => makeOrder(number + i + 1, currentWeekId, spec, stamps[i] as number, pickClient()));
  orders.push(...current);
  menus.push({ weekId: currentWeekId, recipeCodes: briefingCodes, chickenCapG: 26_000, beefCapG: 20_000 });

  return {
    clients,
    recipes: recipes.map((r) => (lastServed.has(r.code) ? { ...r, lastServedWeek: lastServed.get(r.code) as string } : r)),
    settings: DEFAULT_SETTINGS,
    menus,
    orders,
    plans,
    currentWeekId,
    historyWeekIds,
  };
}

/** 40 × plan 5 + 10 × plan 10 (300 portions), 5 gluten-free plan-5 orders (G = 25); 33/10/7 routes, inside every quota. */
function currentWeekSpecs(rng: Rng): OrderSpec[] {
  const gluten = shuffleInPlace(Array.from({ length: 40 }, (_, i) => i < 5), rng);
  const plans = shuffleInPlace(
    [...gluten.map((flag): OrderSpec => ({ plan: 5, glutenFree: flag, route: 'open' })), ...Array.from({ length: 10 }, (): OrderSpec => ({ plan: 10, glutenFree: false, route: 'open' }))],
    rng,
  );
  const routes = shuffleInPlace(Array.from({ length: 50 }, (_, i): RouteId => (i < 33 ? 'open' : i < 43 ? 'morning' : 'afternoon')), rng);
  return plans.map((spec, i) => ({ ...spec, route: routes[i] as RouteId }));
}
