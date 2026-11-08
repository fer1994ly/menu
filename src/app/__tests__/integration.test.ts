import { vi } from 'vitest';
import { uniqueDbName } from '@/features/history/__tests__/helpers';
import { BEFORE_FIRST_RECORD } from '@/features/history/application/StateAtService';
import { MAX_UNDO_STEPS, UNDO_EXHAUSTED_MESSAGE } from '@/features/history/application/ChangeService';
import { InlinePlanRunner } from '@/features/planning/infrastructure/planWorkerClient';
import { MESSAGES } from '@/features/planning/domain/types';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { closeInstantForWeek, weekIdForInstant } from '@/shared/kernel/time';
import { createAppServices, type AppServices } from '../container';

// Friday 2026-11-13 10:00 Monterrey: the week of Sunday 2026-11-15 is open.
const FRIDAY = Date.UTC(2026, 10, 13, 16, 0, 0);
const HOUR = 3_600_000;
const MIN = 60_000;

async function boot(startAt: number = FRIDAY): Promise<{ services: AppServices; time: { now: number } }> {
  const time = { now: startAt };
  const result = await createAppServices({
    dbName: uniqueDbName(),
    clock: () => time.now,
    runner: new InlinePlanRunner(),
    bus: new InMemorySyncHub().connect(),
    tabId: 'tab-test',
  });
  if (result.status !== 'ready') throw new Error('services not ready');
  return { services: result.services, time };
}

// Every test boots a seeded app (26.000 orders), which can exceed the default timeout.
vi.setConfig({ testTimeout: 120_000 });

const BRIEFING_INTEGERS = [79, 39, 64, 58, 30, 30];

describe('seeded application', () => {
  // Read-only tests share one seeded app; every test that mutates boots its own (order-independent).
  let shared: AppServices;
  beforeAll(async () => {
    ({ services: shared } = await boot());
  }, 120_000);

  it('has 2.000 clients, 66 recipes, 26.000 history orders over 52 weeks', async () => {
    const { repos, seedReport } = shared;
    expect(seedReport.seeded).toBe(true);
    expect(await repos.clients.count()).toBe(2000);
    expect((await repos.recipes.list()).length).toBe(66);
    const plans = await repos.plans.list();
    expect(plans).toHaveLength(52);
    const orders = await repos.orders.listAll();
    const current = weekIdForInstant(FRIDAY);
    expect(orders.filter((o) => o.weekId !== current)).toHaveLength(26_000);
    expect(new Set(plans.map((p) => p.weekId)).size).toBe(52);
  });

  it('calculates the current week as briefing case 1', async () => {
    const { services } = await boot();
    const week = weekIdForInstant(FRIDAY);
    const outcome = await services.plans.calculate(week);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.integer.map((p) => p.portions)).toEqual(BRIEFING_INTEGERS);
    expect(outcome.record.input).toMatchObject({ totalPortions: 300, glutenFreePortions: 25 });
    expect(outcome.result.warnings).toEqual([]);
  });

  it('an order loaded Saturday 11:31 lands in the next week and leaves the current plan untouched', async () => {
    const { services, time } = await boot();
    const week = weekIdForInstant(FRIDAY);
    await services.plans.calculate(week);
    const before = (await services.plans.getRecord(week))!;
    time.now = closeInstantForWeek(week) + MIN; // 11:31
    const placed = await services.orders.place({ clientId: 'c-0001', plan: 5, glutenFree: false, route: 'open' });
    expect(placed.order.weekId).toBe('2026-11-22');
    expect(placed.notices.map((n) => n.kind)).toContain('late-close');
    const after = (await services.plans.getRecord(week))!;
    expect(after.stale).toBe(false);
    expect(after.inputsHash).toBe(before.inputsHash);
    expect((await services.plans.buildInput(week)).input.totalPortions).toBe(300);
    expect(await services.repos.orders.get(placed.order.id)).toMatchObject({ code: 'P-026051' });
  });

  it('rejects orders for unknown clients', async () => {
    await expect(shared.orders.place({ clientId: 'nope', plan: 5, glutenFree: false, route: 'open' })).rejects.toThrow(/nope/);
  });

  it('11:30:00 sharp still belongs to the current week', async () => {
    const { services, time } = await boot();
    const week = weekIdForInstant(FRIDAY);
    time.now = closeInstantForWeek(week);
    const placed = await services.orders.place({ clientId: 'c-0002', plan: 5, glutenFree: false, route: 'open' });
    expect(placed.order.weekId).toBe(week);
    const outcome = await services.plans.calculate(week);
    expect(outcome.ok && outcome.record.input.totalPortions).toBe(305);
  });
});

describe('undo / redo with seeded data', () => {
  it('undoes 50 steps across recipe cost, caps and menu changes; the 51st is disabled', async () => {
    const { services, time } = await boot();
    const week = weekIdForInstant(FRIDAY);
    const recipe = (await services.repos.recipes.get('R1'))!;
    const settings = await services.repos.settings.get();
    const menu = (await services.repos.menus.get(week))!;
    for (let i = 0; i < 52; i += 1) {
      time.now += 1000;
      if (i % 3 === 0) await services.changes.saveRecipe({ ...recipe, cost: 50 + i });
      else if (i % 3 === 1) await services.changes.saveSettings({ ...settings, chickenCapG: 27_000 + i * 100 });
      else await services.changes.saveMenu({ ...menu, beefCapG: 21_000 + i * 100 });
    }
    let steps = 0;
    while (services.changes.getUndoState().canUndo) {
      await services.changes.undo();
      steps += 1;
    }
    expect(steps).toBe(MAX_UNDO_STEPS);
    expect(services.changes.getUndoState().undoDisabledReason).toBe(UNDO_EXHAUSTED_MESSAGE);
    // 52 changes, 50 undone: the first two stay applied.
    expect((await services.repos.recipes.get('R1'))!.cost).toBe(50);
    expect((await services.repos.settings.get()).chickenCapG).toBe(27_100);
    expect((await services.repos.menus.get(week))!.beefCapG).toBe(20_000);
    for (let i = 0; i < MAX_UNDO_STEPS; i += 1) await services.changes.redo();
    expect((await services.repos.recipes.get('R1'))!.cost).toBe(101);
    expect((await services.repos.settings.get()).chickenCapG).toBe(31_900);
  }, 120_000);
});

describe('«estado al…»', () => {
  // Read-only tests share one seeded app; tests that change data boot their own (order-independent).
  let shared: AppServices;
  beforeAll(async () => {
    ({ services: shared } = await boot());
  }, 120_000);

  it('before the first event it returns the seed state with «Antes del primer registro»', async () => {
    const state = await shared.stateAt.reconstruct(FRIDAY - 400 * 24 * HOUR);
    expect(state.notice).toBe(BEFORE_FIRST_RECORD);
    expect(state.orders).toHaveLength(0);
    expect(state.recipes).toHaveLength(66);
    const later = await shared.stateAt.reconstruct(FRIDAY);
    expect(later.notice).toBe(BEFORE_FIRST_RECORD);
    expect(later.orders.length).toBe(26_050);
  });

  it('Saturday 11:00 of a closed week excludes later orders and returns the would-be portions', async () => {
    const weeks = (await shared.repos.plans.list()).filter((p) => p.status === 'optimal').map((p) => p.weekId).sort().reverse();
    let checked = false;
    for (const weekId of weeks) {
      const close = closeInstantForWeek(weekId);
      const at = close - 30 * MIN;
      const [early, final] = await Promise.all([shared.stateAt.planAt(weekId, at), shared.stateAt.planAt(weekId, close)]);
      if (early.result.status !== 'optimal' || final.result.status !== 'optimal') continue;
      const all = await shared.repos.orders.listByWeek(weekId);
      const expectedEarly = all.filter((o) => o.createdAt <= at);
      expect(early.orderCount).toBe(expectedEarly.length);
      expect(final.orderCount).toBe(all.length);
      expect(early.orderCount).toBeLessThan(final.orderCount);
      const cooked = early.portions.reduce((sum, p) => sum + p.portions, 0);
      expect(cooked).toBe(expectedEarly.reduce((sum, o) => sum + o.portions, 0));
      expect(cooked).toBeLessThan(final.portions.reduce((sum, p) => sum + p.portions, 0));
      checked = true;
      break;
    }
    expect(checked).toBe(true);
  });

  it('replays recipe, settings and order events up to the instant, across week boundaries', async () => {
    const { services, time } = await boot();
    const week = weekIdForInstant(FRIDAY);
    const t1 = FRIDAY + HOUR;
    time.now = t1;
    await services.changes.saveRecipe({ ...(await services.repos.recipes.get('R2'))!, cost: 60 });
    const orderId = (await services.repos.orders.listByWeek(week))[0]!.id;
    time.now = t1 + HOUR;
    await services.changes.cancelOrder((await services.repos.orders.get(orderId))!);
    const nextWeekAt = closeInstantForWeek(week) + 2 * HOUR; // already the next week
    time.now = nextWeekAt;
    await services.changes.saveRecipe({ ...(await services.repos.recipes.get('R2'))!, cost: 70 });
    await services.changes.saveSettings({ ...(await services.repos.settings.get()), proteinMin: 36 });

    const cost = async (at: number) => (await services.stateAt.reconstruct(at, { weekId: week })).recipes.find((r) => r.code === 'R2')!.cost;
    expect(await cost(t1 - 1)).toBe(56);
    expect(await cost(t1)).toBe(60);
    expect(await cost(nextWeekAt - 1)).toBe(60);
    expect(await cost(nextWeekAt)).toBe(70);

    const early = await services.stateAt.reconstruct(t1 + 1, { weekId: week });
    expect(early.notice).toBeUndefined();
    expect(early.orders.find((o) => o.id === orderId)!.status).toBe('confirmed');
    const mid = await services.stateAt.reconstruct(t1 + HOUR, { weekId: week });
    expect(mid.orders.find((o) => o.id === orderId)!.status).toBe('cancelled');
    expect((await services.stateAt.reconstruct(t1 - 1)).settings.proteinMin).toBe(37);
    expect((await services.stateAt.reconstruct(nextWeekAt)).settings.proteinMin).toBe(36);
    expect(await services.repos.snapshots.count()).toBe(3); // seed baseline + one per week with changes
  });

  it('undo events replay too: the state after an undo shows the restored value', async () => {
    const { services, time } = await boot();
    time.now += HOUR;
    await services.changes.saveRecipe({ ...(await services.repos.recipes.get('R3'))!, cost: 45 });
    time.now += HOUR;
    await services.changes.undo();
    const state = await services.stateAt.reconstruct(time.now);
    expect(state.recipes.find((r) => r.code === 'R3')!.cost).toBe(41);
    expect((await services.stateAt.reconstruct(time.now - HOUR)).recipes.find((r) => r.code === 'R3')!.cost).toBe(45);
  });
});

describe('plans, staleness and restore', () => {
  it('a recipe price change marks the week plan «desactualizado» with a plan-stale event; infeasible keeps the plan', async () => {
    const { services, time } = await boot();
    const week = weekIdForInstant(FRIDAY);
    await services.plans.calculate(week);
    time.now += HOUR;
    await services.changes.saveRecipe({ ...(await services.repos.recipes.get('R1'))!, cost: 52 });
    expect((await services.plans.getRecord(week))!.stale).toBe(true);
    const stale = await services.repos.events.query({ kinds: ['plan-stale'] });
    expect(stale.events.some((e) => e.entityId === week)).toBe(true);

    await services.changes.saveMenu({ ...(await services.repos.menus.get(week))!, chickenCapG: 10_000 });
    const failed = await services.plans.calculate(week);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.failure.message).toBe(MESSAGES.noSolution);
    expect(failed.kept?.outcome.status).toBe('optimal');
    expect((await services.plans.getRecord(week))!.outcome.status).toBe('optimal');
  }, 120_000);

  it('restoreSampleData wipes the changes and regenerates the seed', async () => {
    const { services, time } = await boot();
    time.now += HOUR;
    await services.changes.saveRecipe({ ...(await services.repos.recipes.get('R1'))!, cost: 99 });
    await services.orders.place({ clientId: 'c-0003', plan: 10, glutenFree: false, route: 'open' });
    expect(await services.repos.events.count()).toBeGreaterThan(0);

    const report = await services.restoreSampleData();
    expect(report.seeded).toBe(true);
    expect(await services.repos.events.count()).toBe(0);
    expect((await services.repos.recipes.get('R1'))!.cost).toBe(48.5);
    expect(await services.repos.orders.count()).toBe(26_050);
    expect(services.changes.getUndoState().canUndo).toBe(false);
  }, 120_000);
});
