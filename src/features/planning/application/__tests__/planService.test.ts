import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from '@/features/history/__tests__/helpers';
import { MESSAGES } from '@/features/planning/domain/types';
import { InlinePlanRunner } from '../../infrastructure/planWorkerClient';
import { IdbPlansRepository } from '../../infrastructure/idbPlanningRepositories';
import { PlanService } from '../PlanService';
import { runPlanJob } from '../planJob';

const WEEK = '2026-11-15';
const PREVIOUS = '2026-11-08';

interface Rig {
  tab: TestTab;
  plans: PlanService;
  repo: IdbPlansRepository;
}

/** Briefing scenario: 40 plan-5 + 10 plan-10 orders (D = 300), 5 gluten-free plan-5 (G = 25). */
async function briefingRig(): Promise<Rig> {
  const tab = await createTestTab({ dbName: uniqueDbName() });
  await seedBasics(tab);
  await tab.menus.putMany([
    { weekId: PREVIOUS, recipeCodes: ['R7', 'R8', 'R9', 'R10', 'R11', 'R12'] },
    { weekId: WEEK, recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 26000, beefCapG: 20000 },
  ]);
  const orders = Array.from({ length: 50 }, (_, i) =>
    makeOrder({
      id: `o-${i}`,
      code: `P-${i}`,
      weekId: WEEK,
      plan: i < 40 ? 5 : 10,
      portions: i < 40 ? 5 : 10,
      glutenFree: i < 5,
    }),
  );
  await tab.orders.putMany(orders);
  const repo = new IdbPlansRepository(tab.db);
  const plans = new PlanService({
    orders: tab.orders,
    recipes: tab.recipes,
    menus: tab.menus,
    settings: tab.settings,
    plans: repo,
    events: tab.events,
    runner: new InlinePlanRunner(),
    clock: () => tab.clock.now,
    user: () => 'Ana',
    tabId: 'tab-a',
  });
  tab.changes.addChangeListener(plans.onChange);
  return { tab, plans, repo };
}

const portionsOf = (record: { outcome: { status: string; integer?: { portions: number }[] } }): number[] =>
  (record.outcome.integer ?? []).map((p) => p.portions);

describe('PlanService.calculate', () => {
  it('computes briefing case 1, persists the summary and logs plan-calculated', async () => {
    const { plans, repo, tab } = await briefingRig();
    const outcome = await plans.calculate(WEEK);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.integer.map((p) => p.portions)).toEqual([79, 39, 64, 58, 30, 30]);
    expect(outcome.result.traces.costModel).toBeDefined();
    const stored = (await repo.get(WEEK))!;
    expect(portionsOf(stored)).toEqual([79, 39, 64, 58, 30, 30]);
    expect(stored).toMatchObject({ status: 'optimal', stale: false, input: { totalPortions: 300, glutenFreePortions: 25 } });
    expect(stored.inputsHash).toMatch(/^[0-9a-f]{8}$/);
    const events = (await tab.events.query({ entity: 'plan' })).events;
    expect(events).toMatchObject([{ kind: 'plan-calculated', entityId: WEEK, field: 'integer' }]);
  });

  it('blocks the previous week recipes (rotation) and keeps menu caps', async () => {
    const { plans } = await briefingRig();
    const { input, capSource } = await plans.buildInput(WEEK);
    expect(input.blockedCodes).toEqual(['R7', 'R8', 'R9', 'R10', 'R11', 'R12']);
    expect(input.chickenCapG).toBe(26000);
    expect(capSource).toEqual({ chicken: 'menu', beef: 'menu' });
  });

  it('keeps the previous plan when a recalculation is infeasible', async () => {
    const { plans, repo, tab } = await briefingRig();
    await plans.calculate(WEEK);
    await tab.changes.saveMenu({ weekId: WEEK, recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 10000, beefCapG: 20000 });
    expect((await repo.get(WEEK))!.stale).toBe(true);

    const outcome = await plans.calculate(WEEK);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.message).toBe(MESSAGES.noSolution);
    expect(outcome.kept).not.toBeNull();
    const stored = (await repo.get(WEEK))!;
    expect(portionsOf(stored)).toEqual([79, 39, 64, 58, 30, 30]);
  });

  it('stores the failure when there was no previous plan, and reports no orders', async () => {
    const { plans, repo, tab } = await briefingRig();
    await tab.changes.saveMenu({ weekId: WEEK, recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 10000 });
    const outcome = await plans.calculate(WEEK);
    expect(outcome).toMatchObject({ ok: false, kept: null });
    expect((await repo.get(WEEK))!.status).toBe('infeasible');

    const empty = await plans.calculate('2027-01-03');
    expect(empty).toMatchObject({ ok: false, failure: { message: MESSAGES.noOrders } });
  });

  it('explains a stored plan with its simplex traces', async () => {
    const { plans } = await briefingRig();
    expect(await plans.explain(WEEK)).toBeNull();
    await plans.calculate(WEEK);
    const full = await plans.explain(WEEK);
    expect(full?.traces?.costModel).toBeDefined();
  });
});

describe('plan staleness', () => {
  it('marks the plan «desactualizado» and logs plan-stale when a used recipe price changes', async () => {
    const { plans, repo, tab } = await briefingRig();
    await plans.calculate(WEEK);
    tab.clock.now += 1000;
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 52 });
    expect((await repo.get(WEEK))!.stale).toBe(true);
    const stale = (await tab.events.query({ kinds: ['plan-stale'] })).events;
    expect(stale).toMatchObject([{ entity: 'plan', entityId: WEEK, oldValue: false, newValue: true }]);

    await plans.calculate(WEEK);
    expect((await repo.get(WEEK))!.stale).toBe(false);
  });

  it('ignores recipes outside the plan and the cosmetic name', async () => {
    const { plans, repo, tab } = await briefingRig();
    await plans.calculate(WEEK);
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, name: 'Pollo a la mostaza' });
    await tab.recipes.put({ ...(await tab.recipes.get('R1'))!, code: 'R20', name: 'Otra', active: true });
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R20'))!, cost: 70 });
    expect((await repo.get(WEEK))!.stale).toBe(false);
  });

  it('flags cap, band and menu changes but not settings caps shadowed by the menu caps', async () => {
    const { plans, repo, tab } = await briefingRig();
    await plans.calculate(WEEK);

    await tab.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 30000 });
    expect((await repo.get(WEEK))!.stale).toBe(false);

    await tab.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 30000, proteinMin: 36 });
    expect((await repo.get(WEEK))!.stale).toBe(true);

    await plans.calculate(WEEK);
    await tab.changes.saveMenu({ weekId: WEEK, recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 25000, beefCapG: 20000 });
    expect((await repo.get(WEEK))!.stale).toBe(true);
  });

  it('flags order changes inside the week only', async () => {
    const { plans, repo, tab } = await briefingRig();
    await plans.calculate(WEEK);
    await tab.changes.createOrder(makeOrder({ id: 'late', code: 'P-L', weekId: '2026-11-22' }));
    expect((await repo.get(WEEK))!.stale).toBe(false);
    const loaded = (await tab.orders.get('o-10'))!;
    await tab.changes.cancelOrder(loaded);
    expect((await repo.get(WEEK))!.stale).toBe(true);
  });
});

describe('runPlanJob and runners', () => {
  it('runs a week and a history batch as pure functions and reports elapsed time', async () => {
    const { plans } = await briefingRig();
    const { input } = await plans.buildInput(WEEK);
    const week = runPlanJob({ kind: 'planWeek', input });
    expect(week.kind).toBe('planWeek');
    expect(week.elapsedMs).toBeGreaterThanOrEqual(0);
    const history = runPlanJob({ kind: 'recalculateHistory', inputs: [{ weekId: WEEK, input }, { weekId: 'x', input: { ...input, totalPortions: 0, glutenFreePortions: 0 } }] });
    if (history.kind !== 'recalculateHistory') throw new Error('wrong kind');
    expect(history.results.map((r) => r.outcome.status)).toEqual(['optimal', 'no-orders']);
    expect('traces' in history.results[0]!.outcome).toBe(false);
  });

  it('InlinePlanRunner gives the same answers in chunks', async () => {
    const { plans } = await briefingRig();
    const { input } = await plans.buildInput(WEEK);
    const runner = new InlinePlanRunner();
    const single = await runner.planWeek(input);
    expect(single.result.status).toBe('optimal');
    const inputs = Array.from({ length: 9 }, (_, i) => ({ weekId: `w${i}`, input }));
    const batch = await runner.recalculateHistory(inputs);
    expect(batch.results.map((r) => r.weekId)).toEqual(inputs.map((i) => i.weekId));
    runner.dispose();
  });

  it('recalculateHistory persists every stored week', async () => {
    const { plans, repo } = await briefingRig();
    await plans.calculate(WEEK);
    const { records } = await plans.recalculateHistory();
    expect(records).toHaveLength(1);
    expect((await repo.list()).map((r) => r.weekId)).toEqual([WEEK]);
  });
});
