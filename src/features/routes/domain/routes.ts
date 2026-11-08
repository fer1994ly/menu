export type RouteId = 'open' | 'morning' | 'afternoon';

export const ROUTE_IDS: readonly RouteId[] = ['open', 'morning', 'afternoon'];

export interface RouteDefinition {
  id: RouteId;
  label: string;
  /** Delivery window, local time (HH:MM). */
  from: string;
  to: string;
}

export const ROUTE_DEFINITIONS: Record<RouteId, RouteDefinition> = {
  open: { id: 'open', label: 'Ruta abierta 8:00–17:00', from: '08:00', to: '17:00' },
  morning: { id: 'morning', label: 'Mañana 8:00–12:00', from: '08:00', to: '12:00' },
  afternoon: { id: 'afternoon', label: 'Tarde 13:00–17:00', from: '13:00', to: '17:00' },
};

/** Weekly delivery quotas per route (number of deliveries = orders). */
export type RouteQuotas = Record<RouteId, number>;
/** Surcharge per route in cents. */
export type RouteCharges = Record<RouteId, number>;

export const DEFAULT_ROUTE_QUOTAS: RouteQuotas = { open: 90, morning: 30, afternoon: 30 };
export const DEFAULT_ROUTE_CHARGES_CENTS: RouteCharges = { open: 0, morning: 9900, afternoon: 9900 };

export interface RouteOrderLike {
  weekId: string;
  route: RouteId;
  status: 'confirmed' | 'cancelled';
}

export interface RouteOccupancy {
  used: number;
  quota: number;
  free: number;
  full: boolean;
}

/** Occupancy per route for one week. Only confirmed orders consume quota. */
export function routeOccupancy(
  orders: readonly RouteOrderLike[],
  weekId: string,
  quotas: RouteQuotas = DEFAULT_ROUTE_QUOTAS,
): Record<RouteId, RouteOccupancy> {
  const used: Record<RouteId, number> = { open: 0, morning: 0, afternoon: 0 };
  for (const order of orders) {
    if (order.weekId === weekId && order.status === 'confirmed') used[order.route] += 1;
  }
  const entry = (id: RouteId): RouteOccupancy => {
    const quota = quotas[id];
    const free = Math.max(0, quota - used[id]);
    return { used: used[id], quota, free, full: free === 0 };
  };
  return { open: entry('open'), morning: entry('morning'), afternoon: entry('afternoon') };
}
