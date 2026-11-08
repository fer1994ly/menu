import type { CloseTime } from '@/shared/kernel/time';
import type { RouteCharges, RouteId, RouteQuotas } from '@/features/routes/domain/routes';

export type OrderPlan = 5 | 10;
export type OrderStatus = 'confirmed' | 'cancelled';

export interface Order {
  id: string;
  /** Human readable code, e.g. `P-000123`. */
  code: string;
  clientId: string;
  clientName: string;
  plan: OrderPlan;
  /** Portions the order consumes from the weekly quota (equals the plan). */
  portions: number;
  glutenFree: boolean;
  route: RouteId;
  /** Delivery Sunday (`YYYY-MM-DD`) the order belongs to. */
  weekId: string;
  status: OrderStatus;
  /** Route surcharge in cents applied to the final route (0 for the open route). */
  routeChargeCents: number;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms. */
  updatedAt: number;
  /** Optimistic version, starts at 1 and grows with each change. */
  version: number;
}

export interface PlaceOrderRequest {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  plan: OrderPlan;
  glutenFree: boolean;
  /** Route the client asked for. */
  route: RouteId;
}

export interface PlaceOrderContext {
  /** Injected clock: epoch ms or Date. */
  now: number | Date;
  /** Every known order; only confirmed ones consume quota. */
  existingOrders: readonly Order[];
  /** Default 600. */
  weeklyPortionQuota?: number;
  /** Default 90 / 30 / 30. */
  routeQuotas?: RouteQuotas;
  /** Default 0 / 9900 / 9900 cents. */
  routeChargesCents?: RouteCharges;
  /** Default Saturday 11:30. */
  closeTime?: CloseTime;
}

export type OrderNoticeKind = 'late-close' | 'week-quota' | 'route-fallback' | 'route-week';

export interface OrderNotice {
  kind: OrderNoticeKind;
  /** Spanish text ready for the UI. */
  message: string;
}

export interface PlaceOrderResult {
  order: Order;
  notices: OrderNotice[];
}
