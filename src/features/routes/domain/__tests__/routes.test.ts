import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE_CHARGES_CENTS,
  ROUTE_DEFINITIONS,
  routeOccupancy,
  type RouteOrderLike,
} from '../routes';

const order = (route: RouteOrderLike['route'], weekId = 'W1', status: RouteOrderLike['status'] = 'confirmed') => ({
  route,
  weekId,
  status,
});

describe('route definitions', () => {
  it('uses the briefing labels', () => {
    expect(ROUTE_DEFINITIONS.open.label).toBe('Ruta abierta 8:00–17:00');
    expect(ROUTE_DEFINITIONS.morning.label).toBe('Mañana 8:00–12:00');
    expect(ROUTE_DEFINITIONS.afternoon.label).toBe('Tarde 13:00–17:00');
  });

  it('charges $99 for morning and afternoon, nothing for open', () => {
    expect(DEFAULT_ROUTE_CHARGES_CENTS).toEqual({ open: 0, morning: 9900, afternoon: 9900 });
  });
});

describe('routeOccupancy', () => {
  it('counts confirmed orders of the week only', () => {
    const orders = [order('morning'), order('morning'), order('open'), order('morning', 'W2'), order('morning', 'W1', 'cancelled')];
    const occ = routeOccupancy(orders, 'W1');
    expect(occ.morning).toEqual({ used: 2, quota: 30, free: 28, full: false });
    expect(occ.open.used).toBe(1);
    expect(occ.afternoon.used).toBe(0);
  });

  it('flags a route as full when the quota is reached', () => {
    const occ = routeOccupancy([order('afternoon'), order('afternoon')], 'W1', { open: 90, morning: 30, afternoon: 2 });
    expect(occ.afternoon).toEqual({ used: 2, quota: 2, free: 0, full: true });
  });

  it('never reports negative free slots when over quota', () => {
    const occ = routeOccupancy([order('open'), order('open')], 'W1', { open: 1, morning: 0, afternoon: 0 });
    expect(occ.open.free).toBe(0);
    expect(occ.morning.full).toBe(true);
  });
});
