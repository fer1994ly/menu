import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { isIndexedDbAvailable } from '@/shared/infrastructure/db';
import { MAX_UNDO_STEPS, UNDO_EXHAUSTED_MESSAGE } from '../application/ChangeService';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from './helpers';

describe('IndexedDB availability probe', () => {
  it('reports true when IndexedDB works', async () => {
    expect(await isIndexedDbAvailable()).toBe(true);
  });

  it('reports false when the browser blocks IndexedDB', async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      expect(await isIndexedDbAvailable()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: real, writable: true });
    }
  });
});

describe('ChangeService: events', () => {
  let tab: TestTab;
  beforeEach(async () => {
    tab = await createTestTab({ dbName: uniqueDbName() });
    await seedBasics(tab);
  });

  it('appends one immutable event per changed field with user, old and new value', async () => {
    const result = await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 50, kcal: 530 });
    expect(result.ok).toBe(true);
    const { events } = await tab.events.query({ entity: 'recipe', entityId: 'R1' });
    expect(events.map((e) => e.field).sort()).toEqual(['cost', 'kcal']);
    const cost = events.find((e) => e.field === 'cost')!;
    expect(cost).toMatchObject({ user: 'Ana', oldValue: 48.5, newValue: 50, kind: 'change', entity: 'recipe' });
    expect(new Date(cost.at).getTime()).toBe(tab.clock.now);
  });

  it('rejects invalid recipes without writing anything', async () => {
    const result = await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 0 });
    expect(result).toMatchObject({ ok: false, errors: { cost: 'Valor fuera de rango' } });
    expect(await tab.events.count()).toBe(0);
  });

  it('logs creates and cancels with their own kind', async () => {
    const order = makeOrder();
    await tab.changes.createOrder(order);
    tab.clock.now += 1000;
    await tab.changes.cancelOrder((await tab.orders.get(order.id))!);
    const { events } = await tab.events.query({ entityId: order.id });
    expect(events.map((e) => e.kind).sort()).toEqual(['cancel', 'create']);
    expect((await tab.orders.get(order.id))!.status).toBe('cancelled');
  });

  it('filters by entity, user and time window and paginates with a cursor', async () => {
    for (let i = 0; i < 7; i += 1) {
      tab.clock.now += 1000;
      await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 50 + i });
    }
    const first = await tab.events.query({ entity: 'recipe' }, { limit: 3 });
    expect(first.events).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await tab.events.query({ entity: 'recipe' }, { limit: 3, cursor: first.nextCursor });
    const third = await tab.events.query({ entity: 'recipe' }, { limit: 3, cursor: second.nextCursor });
    expect(third.nextCursor).toBeNull();
    const ids = [...first.events, ...second.events, ...third.events].map((e) => e.id);
    expect(new Set(ids).size).toBe(7);
    expect([...ids]).toEqual([...ids].sort().reverse());

    expect((await tab.events.query({ user: 'Nadie' })).events).toHaveLength(0);
    expect((await tab.events.query({ entity: 'order' })).events).toHaveLength(0);
    const window = await tab.events.query({
      from: tab.clock.now - 2000,
      to: tab.clock.now - 1000,
    });
    expect(window.events).toHaveLength(2);
    const byId = await tab.events.query({ entityId: 'R1' }, { limit: 2 });
    expect(byId.events).toHaveLength(2);
  });
});

describe('ChangeService: undo / redo', () => {
  let tab: TestTab;
  beforeEach(async () => {
    tab = await createTestTab({ dbName: uniqueDbName() });
    await seedBasics(tab);
  });

  it('undoes and redoes a recipe cost change, appending undo and redo events', async () => {
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 60 });
    tab.clock.now += 1000;
    expect(await tab.changes.undo()).toBe(true);
    expect((await tab.recipes.get('R1'))!.cost).toBe(48.5);
    tab.clock.now += 1000;
    expect(await tab.changes.redo()).toBe(true);
    expect((await tab.recipes.get('R1'))!.cost).toBe(60);

    const { events } = await tab.events.query({ entityId: 'R1' });
    expect(events.map((e) => e.kind)).toEqual(['redo', 'undo', 'change']);
    expect(events.find((e) => e.kind === 'undo')).toMatchObject({ field: 'cost', oldValue: 60, newValue: 48.5 });
  });

  it('undoes caps (settings) and menu changes', async () => {
    await tab.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 30000 });
    await tab.changes.saveMenu({ weekId: '2026-11-15', recipeCodes: ['R1', 'R2'], chickenCapG: 12000 });
    await tab.changes.undo();
    expect(await tab.menus.get('2026-11-15')).toBeUndefined();
    await tab.changes.undo();
    expect((await tab.settings.get()).chickenCapG).toBe(26000);
  });

  it('undoes an order creation as a cancellation and a cancellation as a restore', async () => {
    const order = makeOrder();
    await tab.changes.createOrder(order);
    await tab.changes.undo();
    expect((await tab.orders.get(order.id))!.status).toBe('cancelled');
    await tab.changes.redo();
    expect((await tab.orders.get(order.id))!.status).toBe('confirmed');
  });

  it('keeps 50 steps: the 51st undo is disabled with the notice', async () => {
    for (let i = 0; i < 55; i += 1) {
      tab.clock.now += 1000;
      await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 50 + i });
    }
    expect(tab.changes.getUndoState().undoDepth).toBe(MAX_UNDO_STEPS);
    let undone = 0;
    while (tab.changes.getUndoState().canUndo) {
      await tab.changes.undo();
      undone += 1;
    }
    expect(undone).toBe(50);
    const state = tab.changes.getUndoState();
    expect(state.canUndo).toBe(false);
    expect(state.undoDisabledReason).toBe(UNDO_EXHAUSTED_MESSAGE);
    expect(await tab.changes.undo()).toBe(false);
    expect((await tab.recipes.get('R1'))!.cost).toBe(54);
  });

  it('a new change clears the redo stack and listeners hear about state changes', async () => {
    const seen: boolean[] = [];
    tab.changes.onUndoStateChange((s) => seen.push(s.canRedo));
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 60 });
    await tab.changes.undo();
    expect(tab.changes.getUndoState().canRedo).toBe(true);
    await tab.changes.saveRecipe({ ...(await tab.recipes.get('R1'))!, cost: 61 });
    expect(tab.changes.getUndoState().canRedo).toBe(false);
    expect(seen).toEqual([false, true, false]);
    tab.changes.resetUndo();
    expect(tab.changes.getUndoState().canUndo).toBe(false);
    expect(await tab.changes.redo()).toBe(false);
  });
});
