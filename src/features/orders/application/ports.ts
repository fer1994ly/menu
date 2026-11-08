import type { Order } from '../domain/order';

export interface OrdersRepository {
  get(id: string): Promise<Order | undefined>;
  put(order: Order): Promise<void>;
  putMany(orders: readonly Order[]): Promise<void>;
  listByWeek(weekId: string): Promise<Order[]>;
  /** Orders of `weekId` and every later week. */
  listFromWeek(weekId: string): Promise<Order[]>;
  listByClient(clientId: string): Promise<Order[]>;
  listAll(): Promise<Order[]>;
  count(): Promise<number>;
  /** Atomic across tabs: next number for the human readable code. */
  nextOrderNumber(): Promise<number>;
}
