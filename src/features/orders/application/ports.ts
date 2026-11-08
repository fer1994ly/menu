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
  /**
   * Atomic across tabs: in ONE readwrite transaction reserves the next order number,
   * reads the orders of `fromWeek` and later, lets the synchronous `decide` build the
   * order from them and stores it. Two tabs can never both pass the same quota check.
   * If `decide` throws nothing is written (the number is not consumed).
   */
  placeAtomically(fromWeek: string, decide: (existing: readonly Order[], number: number) => Order): Promise<Order>;
}
