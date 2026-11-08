import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { IdbClientsRepository } from '@/features/clients/infrastructure/idbClientsRepository';
import { createTestTab, seedBasics, uniqueDbName, type TestTab } from '@/features/history/__tests__/helpers';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { OrderService } from '../OrderService';
import { weekPortionsUsed } from '../../domain/placeOrder';

// Monday 2026-11-09 10:00 Monterrey: the week of 2026-11-15 is open.
const MONDAY = Date.UTC(2026, 10, 9, 16, 0, 0);
const WEEK = '2026-11-15';

function service(tab: TestTab): OrderService {
  return new OrderService({
    orders: tab.orders,
    clients: new IdbClientsRepository(tab.db),
    settings: tab.settings,
    changes: tab.changes,
    clock: () => MONDAY,
  });
}

describe('OrderService: two tabs placing orders at the same time', () => {
  it('never lets both pass the weekly quota check', async () => {
    const dbName = uniqueDbName();
    const hub = new InMemorySyncHub();
    const a = await createTestTab({ dbName, hub, tabId: 'tab-a', now: MONDAY });
    const b = await createTestTab({ dbName, hub, tabId: 'tab-b', now: MONDAY });
    await seedBasics(a);
    await a.settings.put({ ...DEFAULT_SETTINGS, weeklyPortionQuota: 10 });
    await new IdbClientsRepository(a.db).putMany([{ id: 'c-1', name: 'Ana', phone: '1' }]);

    const requests = Array.from({ length: 6 }, (_, i) => ({ clientId: 'c-1', plan: 5 as const, glutenFree: false, route: 'open' as const, i }));
    const results = await Promise.all(
      requests.map((request, i) => service(i % 2 === 0 ? a : b).place(request)),
    );

    const stored = await a.orders.listAll();
    expect(stored).toHaveLength(6);
    expect(new Set(stored.map((o) => o.code)).size).toBe(6);
    expect(weekPortionsUsed(stored, WEEK)).toBeLessThanOrEqual(10);
    expect(results.filter((r) => r.order.weekId === WEEK)).toHaveLength(2);
    expect(await a.events.count()).toBe(6);
  });
});
