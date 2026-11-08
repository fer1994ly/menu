import {
  DEFAULT_CLOSE_TIME,
  isAfterCalendarClose,
  nextWeekId,
  weekIdForInstant,
} from '@/shared/kernel/time';
import {
  DEFAULT_ROUTE_CHARGES_CENTS,
  DEFAULT_ROUTE_QUOTAS,
  routeOccupancy,
  type RouteId,
} from '@/features/routes/domain/routes';
import { formatCloseTime, ORDER_MESSAGES } from './messages';
import type { Order, OrderNotice, PlaceOrderContext, PlaceOrderRequest, PlaceOrderResult } from './order';

export const DEFAULT_WEEKLY_PORTION_QUOTA = 600;
/** Safety bound on the week cascade (two years of weeks). */
const MAX_CASCADE_WEEKS = 104;

/** Portions already committed in a week. Cancelled orders do not count. */
export function weekPortionsUsed(orders: readonly Order[], weekId: string): number {
  let total = 0;
  for (const order of orders) {
    if (order.weekId === weekId && order.status === 'confirmed') total += order.portions;
  }
  return total;
}

/**
 * Pure placement decision. Order of rules:
 * 1. week by close (11:30:00 inclusive; later goes to the next week, with notice);
 * 2. weekly portion quota: an order that does not fit whole moves to the next week
 *    (repeating until it fits);
 * 3. route quota: a full morning/afternoon route falls back to the open route; if
 *    the open route is full too, the order moves to the next week and tries the
 *    originally requested route again.
 */
export function placeOrder(request: PlaceOrderRequest, context: PlaceOrderContext): PlaceOrderResult {
  const closeTime = context.closeTime ?? DEFAULT_CLOSE_TIME;
  const weeklyQuota = context.weeklyPortionQuota ?? DEFAULT_WEEKLY_PORTION_QUOTA;
  const quotas = context.routeQuotas ?? DEFAULT_ROUTE_QUOTAS;
  const charges = context.routeChargesCents ?? DEFAULT_ROUTE_CHARGES_CENTS;
  const now = typeof context.now === 'number' ? context.now : context.now.getTime();
  const portions = request.plan;

  if (portions > weeklyQuota) {
    throw new RangeError(`An order of ${portions} portions can never fit a weekly quota of ${weeklyQuota}`);
  }

  const notices: OrderNotice[] = [];
  let weekId = weekIdForInstant(now, closeTime);
  if (isAfterCalendarClose(now, closeTime)) {
    notices.push({
      kind: 'late-close',
      message: ORDER_MESSAGES.lateClose(formatCloseTime(closeTime.hour, closeTime.minute), weekId),
    });
  }

  for (let attempt = 0; attempt < MAX_CASCADE_WEEKS; attempt += 1) {
    const free = Math.max(0, weeklyQuota - weekPortionsUsed(context.existingOrders, weekId));
    if (portions > free) {
      weekId = nextWeekId(weekId);
      notices.push({ kind: 'week-quota', message: ORDER_MESSAGES.weekQuotaFull(portions, free, weekId) });
      continue;
    }

    const occupancy = routeOccupancy(context.existingOrders, weekId, quotas);
    let route: RouteId | null = null;
    if (!occupancy[request.route].full) {
      route = request.route;
    } else if (request.route !== 'open' && !occupancy.open.full) {
      route = 'open';
      notices.push({ kind: 'route-fallback', message: ORDER_MESSAGES.routeFallback(request.route) });
    }

    if (route === null) {
      weekId = nextWeekId(weekId);
      notices.push({ kind: 'route-week', message: ORDER_MESSAGES.routesFullNextWeek(request.route, weekId) });
      continue;
    }

    const order: Order = {
      id: request.id,
      code: request.code,
      clientId: request.clientId,
      clientName: request.clientName,
      plan: request.plan,
      portions,
      glutenFree: request.glutenFree,
      route,
      weekId,
      status: 'confirmed',
      routeChargeCents: charges[route],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    return { order, notices };
  }

  throw new RangeError('No week with free capacity found within the cascade limit');
}

/** Cancels an order; its portions and route slot become free again (quotas count confirmed orders only). */
export function cancelOrder(order: Order, now: number | Date): Order {
  if (order.status === 'cancelled') return order;
  const at = typeof now === 'number' ? now : now.getTime();
  return { ...order, status: 'cancelled', updatedAt: at, version: order.version + 1 };
}
