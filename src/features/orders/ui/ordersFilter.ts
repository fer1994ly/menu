import type { Order, OrderPlan } from '../domain/order';
import type { RouteId } from '@/features/routes/domain/routes';

export interface OrderFilters {
  /** Delivery Sunday, or `all`. */
  week: string;
  search: string;
  plan: '' | `${OrderPlan}`;
  route: '' | RouteId;
  glutenFree: '' | 'yes' | 'no';
}

/** Lower case without accents, for forgiving searches. */
export const normalizeSearch = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Pure filter: search by client name or order code, plus plan / route / gluten-free. */
export function filterOrders(orders: readonly Order[], filters: OrderFilters): Order[] {
  const term = normalizeSearch(filters.search.trim());
  return orders.filter((order) => {
    if (filters.plan && String(order.plan) !== filters.plan) return false;
    if (filters.route && order.route !== filters.route) return false;
    if (filters.glutenFree === 'yes' && !order.glutenFree) return false;
    if (filters.glutenFree === 'no' && order.glutenFree) return false;
    if (term === '') return true;
    return normalizeSearch(order.clientName).includes(term) || order.code.toLowerCase().includes(term);
  });
}
