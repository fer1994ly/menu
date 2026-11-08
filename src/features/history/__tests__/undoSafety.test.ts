import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from './helpers';

const WEEK = '2026-11-15';
const CLOSE = closeInstantForWeek(WEEK);
const MIN = 60_000;

async function twoTabs(): Promise<{ a: TestTab; b: TestTab }> {
  const dbName = uniqueDbName();
  const hub = new InMemorySyncHub();
  const a = await createTestTab({ dbName, hub, tabId: 'tab-a', user: 'Ana', now: CLOSE - 600 * MIN });
  const b = await createTestTab({ dbName, hub, tabId: 'tab-b', user: 'Beto', now: CLOSE - 590 * MIN });
  await seedBasics(a);
  return { a, b };
}

describe('undo / redo against concurrent changes', () => {
  it('refuses to undo an order that another tab changed afterwards and leaves it untouched', async () => {
    const { a, b } = await twoTabs();
    await a.orders.put(makeOrder());
    const loaded = (await a.orders.get('o-1'))!;
    await a.changes.saveOrder(loaded, { ...loaded, plan: 10 });
    const theirs = (await b.orders.get('o-1'))!;
    await b.changes.saveOrder(theirs, { ...theirs, glutenFree: true });
    const before = (await a.orders.get('o-1'))!;

    const outcome = await a.changes.undo();
    expect(outcome).toEqual({
      status: 'refused',
      message: expect.stringContaining('P-000001'),
    });
    expect(await a.orders.get('o-1')).toEqual(before);
    // The unusable step is dropped: the stack stays consistent and does not offer it again.
    expect(a.changes.getUndoState()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('refuses to undo a recipe or settings change modified by another tab', async () => {
    const { a, b } = await twoTabs();
    await a.changes.saveRecipe({ ...(await a.recipes.get('R1'))!, cost: 60 });
    await b.changes.saveRecipe({ ...(await b.recipes.get('R1'))!, cost: 61 });
    expect(await a.changes.undo()).toMatchObject({ status: 'refused' });
    expect((await a.recipes.get('R1'))!.cost).toBe(61);

    await a.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 30000 });
    await b.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 31000 });
    expect(await a.changes.undo()).toMatchObject({ status: 'refused' });
    expect((await a.settings.get()).chickenCapG).toBe(31000);
  });

  it('keeps undo, redo and undo working over the values this tab wrote itself', async () => {
    const { a } = await twoTabs();
    await a.orders.put(makeOrder());
    const loaded = (await a.orders.get('o-1'))!;
    await a.changes.saveOrder(loaded, { ...loaded, plan: 10 });
    expect(await a.changes.undo()).toMatchObject({ status: 'done' });
    expect(await a.changes.redo()).toMatchObject({ status: 'done' });
    expect(await a.changes.undo()).toMatchObject({ status: 'done' });
    expect((await a.orders.get('o-1'))!.plan).toBe(5);
    expect(await a.changes.undo()).toEqual({ status: 'empty' });
  });

  it('refuses to undo or redo an order once its week closed', async () => {
    const { a } = await twoTabs();
    await a.orders.put(makeOrder());
    const loaded = (await a.orders.get('o-1'))!;
    await a.changes.saveOrder(loaded, { ...loaded, plan: 10 });
    a.clock.now = CLOSE + MIN;
    const outcome = await a.changes.undo();
    expect(outcome).toMatchObject({ status: 'refused', message: expect.stringContaining('semana cerrada') });
    expect((await a.orders.get('o-1'))!.plan).toBe(10);
  });

  it('refuses to undo a cancellation when the quota no longer has room, then allows it once it does', async () => {
    const { a } = await twoTabs();
    await a.settings.put({ ...DEFAULT_SETTINGS, weeklyPortionQuota: 10 });
    await a.orders.put(makeOrder());
    const loaded = (await a.orders.get('o-1'))!;
    await a.changes.cancelOrder(loaded);
    await a.orders.put(makeOrder({ id: 'o-2', code: 'P-000002', plan: 10, portions: 10 }));

    expect(await a.changes.undo()).toMatchObject({ status: 'refused', message: expect.stringContaining('P-000001') });
    expect((await a.orders.get('o-1'))!.status).toBe('cancelled');
    expect(a.changes.getUndoState().canUndo).toBe(true);

    await a.orders.put({ ...(await a.orders.get('o-2'))!, status: 'cancelled' });
    expect(await a.changes.undo()).toMatchObject({ status: 'done' });
    expect((await a.orders.get('o-1'))!.status).toBe('confirmed');
  });
});
