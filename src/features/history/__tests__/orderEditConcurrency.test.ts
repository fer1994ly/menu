import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from './helpers';

const WEEK = '2026-11-15';
const NOW = closeInstantForWeek(WEEK) - 600 * 60_000;

describe('two tabs editing different orders at the same time', () => {
  let tabA: TestTab;
  let tabB: TestTab;

  beforeEach(async () => {
    const dbName = uniqueDbName();
    const hub = new InMemorySyncHub();
    tabA = await createTestTab({ dbName, hub, now: NOW, tabId: 'tab-a' });
    tabB = await createTestTab({ dbName, hub, now: NOW, tabId: 'tab-b' });
    await seedBasics(tabA);
    await tabA.settings.put({
      ...DEFAULT_SETTINGS,
      weeklyPortionQuota: 16,
      routeQuotas: { open: 5, morning: 1, afternoon: 1 },
      routeChargeCents: 9900,
    });
    await tabA.orders.put(makeOrder({ id: 'o-1', code: 'P-000001' }));
    await tabA.orders.put(makeOrder({ id: 'o-2', code: 'P-000002' }));
  });

  it('lets only one weekly plan increase through when both together exceed the quota', async () => {
    const [one, two] = await Promise.all([tabA.orders.get('o-1'), tabB.orders.get('o-2')]);
    const outcomes = await Promise.all([
      tabA.changes.saveOrder(one!, { ...one!, plan: 10, portions: 10 }),
      tabB.changes.saveOrder(two!, { ...two!, plan: 10, portions: 10 }),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['rejected', 'saved']);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect(rejected).toMatchObject({ reason: 'plan-quota' });
    const stored = await tabA.orders.listByWeek(WEEK);
    expect(stored.reduce((sum, o) => sum + o.portions, 0)).toBe(15);
  });

  it('lets only one order into the last place of a route', async () => {
    const [one, two] = await Promise.all([tabA.orders.get('o-1'), tabB.orders.get('o-2')]);
    const outcomes = await Promise.all([
      tabA.changes.saveOrder(one!, { ...one!, route: 'morning' }),
      tabB.changes.saveOrder(two!, { ...two!, route: 'morning' }),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['rejected', 'saved']);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({ reason: 'route-full' });
    const stored = await tabA.orders.listByWeek(WEEK);
    expect(stored.filter((o) => o.route === 'morning')).toHaveLength(1);
  });

  it('lets only one undo reactivate an order into the last place of a route', async () => {
    await tabA.orders.putMany([
      makeOrder({ id: 'o-3', code: 'P-000003', route: 'morning' }),
      makeOrder({ id: 'o-4', code: 'P-000004', route: 'morning' }),
    ]);
    const three = (await tabA.orders.get('o-3'))!;
    const four = (await tabB.orders.get('o-4'))!;
    expect((await tabA.changes.cancelOrder(three)).status).toBe('saved');
    expect((await tabB.changes.cancelOrder(four)).status).toBe('saved');
    const [undoA, undoB] = await Promise.all([tabA.changes.undo(), tabB.changes.undo()]);
    expect([undoA.status, undoB.status].sort()).toEqual(['done', 'refused']);
    const stored = await tabA.orders.listByWeek(WEEK);
    expect(stored.filter((o) => o.route === 'morning' && o.status === 'confirmed')).toHaveLength(1);
  });
});
