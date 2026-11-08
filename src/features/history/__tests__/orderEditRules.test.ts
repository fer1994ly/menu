import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { closeInstantForWeek, weekIdForInstant } from '@/shared/kernel/time';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from './helpers';

const WEEK = '2026-11-15';
const CLOSE = closeInstantForWeek(WEEK);
const MIN = 60_000;

describe('editing orders: closed week', () => {
  let tab: TestTab;
  beforeEach(async () => {
    tab = await createTestTab({ dbName: uniqueDbName(), now: CLOSE - 60 * MIN });
    await seedBasics(tab);
    await tab.orders.put(makeOrder({ code: 'P-000123' }));
  });

  it('rejects an edit after the Saturday close without touching the order or the log', async () => {
    const loaded = (await tab.orders.get('o-1'))!;
    tab.clock.now = CLOSE + 1000;
    const outcome = await tab.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    expect(outcome).toEqual({
      status: 'rejected',
      reason: 'week-closed',
      message:
        'El pedido P-000123 es de una semana cerrada el sábado a las 11:30: ya no se puede cambiar porque la producción se calculó con él.',
    });
    expect(await tab.orders.get('o-1')).toEqual(loaded);
    expect(await tab.events.count()).toBe(0);
    expect(tab.changes.getUndoState().canUndo).toBe(false);
  });

  it('rejects a cancellation after the close too', async () => {
    const loaded = (await tab.orders.get('o-1'))!;
    tab.clock.now = CLOSE + 5 * MIN;
    const outcome = await tab.changes.cancelOrder(loaded);
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'week-closed' });
    expect((await tab.orders.get('o-1'))!.status).toBe('confirmed');
  });

  it('still allows the edit at the close second and honours the configured close time', async () => {
    const loaded = (await tab.orders.get('o-1'))!;
    tab.clock.now = CLOSE + 999;
    expect((await tab.changes.saveOrder(loaded, { ...loaded, glutenFree: true })).status).toBe('saved');

    await tab.settings.put({ ...DEFAULT_SETTINGS, closeTime: { hour: 14, minute: 0 } });
    const again = (await tab.orders.get('o-1'))!;
    tab.clock.now = CLOSE + 60 * MIN; // 12:30, before the configured 14:00
    expect((await tab.changes.saveOrder(again, { ...again, glutenFree: false })).status).toBe('saved');
    const latest = (await tab.orders.get('o-1'))!;
    tab.clock.now = CLOSE + 4 * 60 * MIN; // 15:30
    expect((await tab.changes.saveOrder(latest, { ...latest, glutenFree: true })).status).toBe('rejected');
  });
});

describe('editing orders: quotas', () => {
  let tab: TestTab;
  beforeEach(async () => {
    tab = await createTestTab({ dbName: uniqueDbName(), now: CLOSE - 600 * MIN });
    await seedBasics(tab);
    await tab.settings.put({
      ...DEFAULT_SETTINGS,
      weeklyPortionQuota: 10,
      routeQuotas: { open: 5, morning: 1, afternoon: 1 },
      routeChargeCents: 9900,
    });
    await tab.orders.put(makeOrder());
  });

  it('rejects a plan increase that does not fit the weekly quota', async () => {
    await tab.orders.put(makeOrder({ id: 'o-2', code: 'P-000002' }));
    const loaded = (await tab.orders.get('o-1'))!;
    const outcome = await tab.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'plan-quota' });
    expect((await tab.orders.get('o-1'))!.plan).toBe(5);
    expect(await tab.events.count()).toBe(0);
  });

  it('accepts a plan increase that fits and forces portions to follow the plan', async () => {
    const loaded = (await tab.orders.get('o-1'))!;
    const outcome = await tab.changes.saveOrder(loaded, { ...loaded, plan: 10 });
    expect(outcome.status).toBe('saved');
    expect(await tab.orders.get('o-1')).toMatchObject({ plan: 10, portions: 10 });
  });

  it('rejects moving to a full route and keeps the order', async () => {
    await tab.orders.put(makeOrder({ id: 'o-2', code: 'P-000002', route: 'morning', routeChargeCents: 9900, portions: 0 }));
    const loaded = (await tab.orders.get('o-1'))!;
    const outcome = await tab.changes.saveOrder(loaded, { ...loaded, route: 'morning' });
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'route-full' });
    expect((await tab.orders.get('o-1'))!.route).toBe('open');
  });

  it('charges the route surcharge when moving to a paid route and clears it on the open route', async () => {
    const loaded = (await tab.orders.get('o-1'))!;
    await tab.changes.saveOrder(loaded, { ...loaded, route: 'afternoon' });
    expect(await tab.orders.get('o-1')).toMatchObject({ route: 'afternoon', routeChargeCents: 9900 });
    const paid = (await tab.orders.get('o-1'))!;
    await tab.changes.saveOrder(paid, { ...paid, route: 'open' });
    expect(await tab.orders.get('o-1')).toMatchObject({ route: 'open', routeChargeCents: 0 });
  });

  it('keeps the stored surcharge when the route does not change', async () => {
    await tab.orders.put(makeOrder({ id: 'o-3', code: 'P-000003', route: 'morning', routeChargeCents: 9900 }));
    const loaded = (await tab.orders.get('o-3'))!;
    await tab.settings.put({ ...(await tab.settings.get()), routeChargeCents: 5000 });
    await tab.changes.saveOrder(loaded, { ...loaded, glutenFree: true });
    expect((await tab.orders.get('o-3'))!.routeChargeCents).toBe(9900);
  });
});

describe('weekly snapshot', () => {
  it('uses the configured close time to decide the week', async () => {
    const tab = await createTestTab({ dbName: uniqueDbName(), now: CLOSE + 60 * MIN }); // Saturday 12:30
    await seedBasics(tab);
    await tab.settings.put({ ...DEFAULT_SETTINGS, closeTime: { hour: 14, minute: 0 } });
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 55 });
    const expected = weekIdForInstant(tab.clock.now, { hour: 14, minute: 0 });
    expect(expected).toBe(WEEK);
    expect(await tab.snapshots.get(`week-${WEEK}`)).toBeDefined();
    expect(await tab.snapshots.get('week-2026-11-22')).toBeUndefined();
  });
});
