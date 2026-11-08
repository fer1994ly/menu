import { routeOccupancy, type RouteQuotas } from '@/features/routes/domain/routes';
import { isWeekClosed, type CloseTime } from '@/shared/kernel/time';
import { formatCloseTime, ORDER_MESSAGES } from './messages';
import type { Order } from './order';
import { weekPortionsUsed } from './placeOrder';

export type OrderEditRejectionReason = 'week-closed' | 'plan-quota' | 'route-full';

export interface OrderEditRejection {
  reason: OrderEditRejectionReason;
  /** Spanish text ready for the UI. */
  message: string;
}

/** An order of a closed week can no longer change: production was already calculated with it. */
export function checkWeekOpen(order: Order, now: number, closeTime: CloseTime): OrderEditRejection | null {
  if (!isWeekClosed(order.weekId, now, closeTime)) return null;
  return {
    reason: 'week-closed',
    message: ORDER_MESSAGES.weekClosed(order.code, formatCloseTime(closeTime.hour, closeTime.minute)),
  };
}

export interface CapacityContext {
  /** Every other order of the same week (the edited order itself excluded). */
  others: readonly Order[];
  weeklyPortionQuota: number;
  routeQuotas: RouteQuotas;
}

/**
 * Edits never move an order to another week: a plan increase that does not fit
 * the weekly quota, or a move to a full route, is rejected. Only changes that
 * ask for NEW capacity are checked (a plan growth, a route change, a reactivation).
 */
export function checkOrderCapacity(stored: Order, edited: Order, context: CapacityContext): OrderEditRejection | null {
  if (edited.status !== 'confirmed') return null;
  const reactivated = stored.status !== 'confirmed';

  if (reactivated || edited.portions > stored.portions) {
    const free = Math.max(0, context.weeklyPortionQuota - weekPortionsUsed(context.others, stored.weekId));
    if (edited.portions > free) {
      return { reason: 'plan-quota', message: ORDER_MESSAGES.editPlanQuota(stored.code, edited.portions, free) };
    }
  }
  if (reactivated || edited.route !== stored.route) {
    const occupancy = routeOccupancy(context.others, stored.weekId, context.routeQuotas);
    if (occupancy[edited.route].full) {
      return { reason: 'route-full', message: ORDER_MESSAGES.editRouteFull(stored.code, edited.route) };
    }
  }
  return null;
}
