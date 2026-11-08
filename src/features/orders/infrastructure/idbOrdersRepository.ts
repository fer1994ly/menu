import { bulkPut, type AppDb } from '@/shared/infrastructure/db';
import type { OrdersRepository } from '../application/ports';
import type { Order } from '../domain/order';

const COUNTER_KEY = 'orderCounter';

export class IdbOrdersRepository implements OrdersRepository {
  constructor(private readonly db: AppDb) {}

  get(id: string): Promise<Order | undefined> {
    return this.db.get('orders', id);
  }

  async put(order: Order): Promise<void> {
    await this.db.put('orders', order);
  }

  putMany(orders: readonly Order[]): Promise<void> {
    return bulkPut(this.db, 'orders', orders);
  }

  listByWeek(weekId: string): Promise<Order[]> {
    return this.db.getAllFromIndex('orders', 'weekId', weekId);
  }

  listFromWeek(weekId: string): Promise<Order[]> {
    return this.db.getAllFromIndex('orders', 'weekId', IDBKeyRange.lowerBound(weekId));
  }

  listByClient(clientId: string): Promise<Order[]> {
    return this.db.getAllFromIndex('orders', 'clientId', clientId);
  }

  listAll(): Promise<Order[]> {
    return this.db.getAll('orders');
  }

  count(): Promise<number> {
    return this.db.count('orders');
  }

  async nextOrderNumber(): Promise<number> {
    const tx = this.db.transaction(['meta', 'orders'], 'readwrite');
    const meta = tx.objectStore('meta');
    const stored = (await meta.get(COUNTER_KEY)) as number | undefined;
    const current = stored ?? (await tx.objectStore('orders').count());
    const next = current + 1;
    await meta.put(next, COUNTER_KEY);
    await tx.done;
    return next;
  }

  async placeAtomically(fromWeek: string, decide: (existing: readonly Order[], number: number) => Order): Promise<Order> {
    const tx = this.db.transaction(['meta', 'orders'], 'readwrite');
    const done = tx.done.catch(() => undefined);
    try {
      const meta = tx.objectStore('meta');
      const orders = tx.objectStore('orders');
      const stored = (await meta.get(COUNTER_KEY)) as number | undefined;
      const number = (stored ?? (await orders.count())) + 1;
      const existing = await orders.index('weekId').getAll(IDBKeyRange.lowerBound(fromWeek));
      // `decide` must stay synchronous: awaiting anything else would let the transaction auto-commit.
      const order = decide(existing, number);
      await Promise.all([orders.put(order), meta.put(number, COUNTER_KEY)]);
      await tx.done;
      return order;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      await done;
      throw error;
    }
  }
}
