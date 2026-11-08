import { closeInstantForWeek } from '@/shared/kernel/time';
import { InMemorySyncHub, type SyncMessage } from '@/shared/infrastructure/syncChannel';
import { createTestTab, makeOrder, seedBasics, uniqueDbName, type TestTab } from './helpers';

const WEEK = '2026-11-15';
const CLOSE = closeInstantForWeek(WEEK);
const MIN = 60_000;

async function twoTabs(): Promise<{ a: TestTab; b: TestTab; hub: InMemorySyncHub }> {
  const dbName = uniqueDbName();
  const hub = new InMemorySyncHub();
  const a = await createTestTab({ dbName, hub, user: 'Ana', tabId: 'tab-a', now: CLOSE - 600 * MIN });
  const b = await createTestTab({ dbName, hub, user: 'Beto', tabId: 'tab-b', now: CLOSE - 600 * MIN });
  await seedBasics(a);
  await a.orders.put(makeOrder({ weekId: WEEK }));
  return { a, b, hub };
}

describe('two tabs editing the same order', () => {
  it('saves without conflict when the stored version is the one the tab loaded', async () => {
    const { a } = await twoTabs();
    const loaded = (await a.orders.get('o-1'))!;
    const outcome = await a.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    expect(outcome.status).toBe('saved');
    expect((await a.orders.get('o-1'))!.version).toBe(2);
  });

  it('before the close the last saved wins, notice carries both values and the loser can be chosen', async () => {
    const { a, b } = await twoTabs();
    const loadedA = (await a.orders.get('o-1'))!;
    const loadedB = (await b.orders.get('o-1'))!;

    b.clock.now = CLOSE - 120 * MIN;
    await b.changes.saveOrder(loadedB, { ...loadedB, plan: 10, portions: 10 });

    a.clock.now = CLOSE - 60 * MIN;
    const outcome = await a.changes.saveOrder(loadedA, { ...loadedA, route: 'morning' });

    expect(outcome.status).toBe('conflict');
    if (outcome.status !== 'conflict') return;
    expect(outcome.resolution.reason).toBe('last-saved');
    expect(outcome.resolution.winnerSide).toBe('mine');
    expect(outcome.resolution.canChooseOther).toBe(true);
    expect(outcome.resolution.notice).toContain('P-000001');
    expect(outcome.resolution.notice).toContain('plan 10');
    expect(outcome.resolution.notice).toContain('mañana');
    const stored = (await a.orders.get('o-1'))!;
    expect(stored).toMatchObject({ route: 'morning', plan: 5, version: 3 });

    const events = (await a.events.query({ entityId: 'o-1' })).events;
    const marker = events.find((e) => e.field === '_conflict')!;
    expect(marker.kind).toBe('conflict');
    expect(marker.oldValue).toMatchObject({ plan: 10 });
    expect(marker.newValue).toMatchObject({ route: 'morning' });
    expect(marker.meta).toMatchObject({ reason: 'last-saved', winnerSide: 'mine' });

    const other = await a.changes.chooseOtherOrderValue(outcome.resolution);
    expect(other?.status).toBe('saved');
    expect(await a.orders.get('o-1')).toMatchObject({ plan: 10, route: 'open' });
  });

  it('keeps the version saved before the close when the other edit arrives later', async () => {
    const { a, b } = await twoTabs();
    const loadedA = (await a.orders.get('o-1'))!;
    const loadedB = (await b.orders.get('o-1'))!;

    b.clock.now = CLOSE - 10 * MIN;
    await b.changes.saveOrder(loadedB, { ...loadedB, plan: 10, portions: 10 });
    a.clock.now = CLOSE + 5 * MIN;
    const outcome = await a.changes.saveOrder(loadedA, { ...loadedA, route: 'morning' });

    expect(outcome.status).toBe('conflict');
    if (outcome.status !== 'conflict') return;
    expect(outcome.resolution.reason).toBe('saved-before-close');
    expect(outcome.resolution.canChooseOther).toBe(false);
    expect(await a.orders.get('o-1')).toMatchObject({ plan: 10, route: 'open' });
    expect(await a.changes.chooseOtherOrderValue(outcome.resolution)).toBeNull();
    const kinds = (await a.events.query({ entityId: 'o-1' })).events.map((e) => e.kind);
    expect(kinds).toContain('conflict');
  });

  it('restores the stored-before-close version when both saves are late', async () => {
    const { a, b } = await twoTabs();
    const loadedA = (await a.orders.get('o-1'))!;
    const loadedB = (await b.orders.get('o-1'))!;

    // Editing after the close is refused now, so a late stored version can only be a legacy record.
    void loadedB;
    await b.orders.put({ ...loadedA, plan: 10, portions: 10, version: 2, updatedAt: CLOSE + 2 * MIN });
    a.clock.now = CLOSE + 4 * MIN;
    const outcome = await a.changes.saveOrder(loadedA, { ...loadedA, route: 'afternoon' });

    expect(outcome.status).toBe('conflict');
    if (outcome.status !== 'conflict') return;
    expect(outcome.resolution.reason).toBe('stored-before-close');
    expect(await a.orders.get('o-1')).toMatchObject({ plan: 5, route: 'open', version: 3 });
    const fields = (await a.events.query({ entityId: 'o-1' })).events.filter((e) => e.kind === 'conflict' && e.field === 'plan');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ oldValue: 10, newValue: 5 });
  });

  it('announces saves and conflicts to the other tab through the sync bus', async () => {
    const dbName = uniqueDbName();
    const hub = new InMemorySyncHub();
    const a = await createTestTab({ dbName, hub, tabId: 'tab-a', now: CLOSE - 600 * MIN });
    const listener = await createTestTab({ dbName, hub, tabId: 'tab-b' });
    void listener;
    const received: SyncMessage[] = [];
    const observer = hub.connect();
    observer.subscribe((m) => received.push(m));
    await seedBasics(a);
    await a.orders.put(makeOrder({ weekId: WEEK }));
    const loaded = (await a.orders.get('o-1'))!;
    await a.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    expect(received).toEqual([
      expect.objectContaining({ type: 'changed', entity: 'order', id: 'o-1', version: 2, tabId: 'tab-a' }),
    ]);
  });
});
