import { describe, expect, it } from 'vitest';
import { cancelOrder, placeOrder, weekPortionsUsed } from '../placeOrder';
import { ORDER_MESSAGES } from '../messages';
import type { Order, PlaceOrderContext, PlaceOrderRequest } from '../order';

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h + 6, mi, s);

const MONDAY = local(2026, 11, 9, 9, 0); // week 2026-11-15
const WEEK = '2026-11-15';
const NEXT = '2026-11-22';
const NEXT2 = '2026-11-29';
const BIG_ROUTES = { open: 1000, morning: 1000, afternoon: 1000 };

const request = (overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest => ({
  id: 'o-new',
  code: 'P-000999',
  clientId: 'c1',
  clientName: 'Ana',
  plan: 5,
  glutenFree: false,
  route: 'open',
  ...overrides,
});

const existing = (n: number, overrides: Partial<Order> = {}): Order[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${overrides.weekId ?? WEEK}-${overrides.route ?? 'open'}-${overrides.plan ?? 5}-${i}`,
    code: `P-${i}`,
    clientId: 'c',
    clientName: 'C',
    plan: 5,
    portions: 5,
    glutenFree: false,
    route: 'open',
    weekId: WEEK,
    status: 'confirmed',
    routeChargeCents: 0,
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    ...overrides,
  }));

const ctx = (overrides: Partial<PlaceOrderContext> = {}): PlaceOrderContext => ({
  now: MONDAY,
  existingOrders: [],
  ...overrides,
});

describe('placeOrder: week assignment', () => {
  it('places a Monday order in the current week with no notices and fills the record', () => {
    const { order, notices } = placeOrder(request({ plan: 10, glutenFree: true }), ctx());
    expect(order).toMatchObject({
      id: 'o-new',
      code: 'P-000999',
      plan: 10,
      portions: 10,
      glutenFree: true,
      route: 'open',
      weekId: WEEK,
      status: 'confirmed',
      routeChargeCents: 0,
      createdAt: MONDAY,
      updatedAt: MONDAY,
      version: 1,
    });
    expect(notices).toEqual([]);
  });

  it('accepts an order at exactly Saturday 11:30:00 into the current week', () => {
    const { order, notices } = placeOrder(request(), ctx({ now: local(2026, 11, 14, 11, 30, 0) }));
    expect(order.weekId).toBe(WEEK);
    expect(notices).toEqual([]);
  });

  it('moves a Saturday 11:30:01 order to the next week with the late-close notice', () => {
    const { order, notices } = placeOrder(request(), ctx({ now: local(2026, 11, 14, 11, 30, 1) }));
    expect(order.weekId).toBe(NEXT);
    expect(notices).toEqual([
      {
        kind: 'late-close',
        message:
          'El pedido entró después del cierre del sábado a las 11:30: pasa a la semana del domingo 22/11.',
      },
    ]);
    expect(notices[0]?.message).toBe(ORDER_MESSAGES.lateClose('11:30', NEXT));
  });

  it('uses the configured close time in the late notice', () => {
    const { notices } = placeOrder(
      request(),
      ctx({ now: local(2026, 11, 14, 10, 1), closeTime: { hour: 10, minute: 0 } }),
    );
    expect(notices[0]?.message).toContain('a las 10:00');
  });
});

describe('placeOrder: weekly portion quota', () => {
  it('fills the week exactly up to the quota', () => {
    const { order, notices } = placeOrder(request({ plan: 5 }), ctx({ routeQuotas: BIG_ROUTES, existingOrders: existing(119) })); // 595
    expect(order.weekId).toBe(WEEK);
    expect(notices).toEqual([]);
  });

  it('moves a 10-portion order whole to next week when only 5 portions are free', () => {
    const { order, notices } = placeOrder(request({ plan: 10 }), ctx({ routeQuotas: BIG_ROUTES, existingOrders: existing(119) }));
    expect(order.weekId).toBe(NEXT);
    expect(order.portions).toBe(10);
    expect(notices).toEqual([{ kind: 'week-quota', message: ORDER_MESSAGES.weekQuotaFull(10, 5, NEXT) }]);
    expect(notices[0]?.message).toBe(
      'Esta semana quedan 5 porciones y el pedido es de 10: no se parte, pasa entero a la semana del domingo 22/11.',
    );
  });

  it('cascades through consecutive full weeks', () => {
    const full = [...existing(120, { weekId: WEEK }), ...existing(120, { weekId: NEXT })];
    const { order, notices } = placeOrder(request({ plan: 5 }), ctx({ routeQuotas: BIG_ROUTES, existingOrders: full }));
    expect(order.weekId).toBe(NEXT2);
    expect(notices.map((n) => n.kind)).toEqual(['week-quota', 'week-quota']);
  });

  it('ignores cancelled orders when computing the quota', () => {
    const orders = existing(120, { status: 'cancelled' });
    expect(weekPortionsUsed(orders, WEEK)).toBe(0);
    expect(placeOrder(request(), ctx({ routeQuotas: BIG_ROUTES, existingOrders: orders })).order.weekId).toBe(WEEK);
  });

  it('honours a custom weekly quota and rejects orders bigger than the quota', () => {
    expect(placeOrder(request({ plan: 10 }), ctx({ routeQuotas: BIG_ROUTES, weeklyPortionQuota: 10 })).order.weekId).toBe(WEEK);
    expect(() => placeOrder(request({ plan: 10 }), ctx({ routeQuotas: BIG_ROUTES, weeklyPortionQuota: 5 }))).toThrow(RangeError);
  });

  it('combines a late close with a full next week', () => {
    const { order, notices } = placeOrder(
      request(),
      ctx({ routeQuotas: BIG_ROUTES, now: local(2026, 11, 14, 12, 0), existingOrders: existing(120, { weekId: NEXT }) }),
    );
    expect(order.weekId).toBe(NEXT2);
    expect(notices.map((n) => n.kind)).toEqual(['late-close', 'week-quota']);
  });
});

describe('placeOrder: routes', () => {
  it('charges $99 for the morning route', () => {
    const { order } = placeOrder(request({ route: 'morning' }), ctx());
    expect(order.route).toBe('morning');
    expect(order.routeChargeCents).toBe(9900);
  });

  it('moves a morning order to the open route when morning is full', () => {
    const { order, notices } = placeOrder(
      request({ route: 'morning' }),
      ctx({ existingOrders: existing(30, { route: 'morning', plan: 5 }) }),
    );
    expect(order.route).toBe('open');
    expect(order.weekId).toBe(WEEK);
    expect(order.routeChargeCents).toBe(0);
    expect(notices).toEqual([{ kind: 'route-fallback', message: ORDER_MESSAGES.routeFallback('morning') }]);
    expect(notices[0]?.message).toBe(
      'La ruta Mañana 8:00–12:00 está llena esta semana: el pedido pasa a la ruta abierta y no se cobra el cargo de ruta.',
    );
  });

  it('moves the order to the next week, stating its Sunday, when route and open are full', () => {
    const full = [...existing(30, { route: 'afternoon', plan: 5 }), ...existing(90, { route: 'open', plan: 5 })];
    // 120 orders x 5 = 600 portions would fill the week quota too; use a bigger quota.
    const { order, notices } = placeOrder(
      request({ route: 'afternoon', plan: 5 }),
      ctx({ existingOrders: full, weeklyPortionQuota: 1000 }),
    );
    expect(order.weekId).toBe(NEXT);
    expect(order.route).toBe('afternoon');
    expect(order.routeChargeCents).toBe(9900);
    expect(notices).toEqual([{ kind: 'route-week', message: ORDER_MESSAGES.routesFullNextWeek('afternoon', NEXT) }]);
    expect(notices[0]?.message).toContain('domingo 22/11');
  });

  it('moves an open-route order to the next week when open is full', () => {
    const { order, notices } = placeOrder(
      request({ route: 'open' }),
      ctx({ existingOrders: existing(90, { route: 'open' }), weeklyPortionQuota: 1000 }),
    );
    expect(order.weekId).toBe(NEXT);
    expect(notices.map((n) => n.kind)).toEqual(['route-week']);
  });

  it('honours custom quotas and charges', () => {
    const { order } = placeOrder(
      request({ route: 'morning' }),
      ctx({
        routeQuotas: { open: 1, morning: 1, afternoon: 1 },
        routeChargesCents: { open: 0, morning: 5000, afternoon: 5000 },
      }),
    );
    expect(order.routeChargeCents).toBe(5000);
  });
});

describe('cancelOrder', () => {
  it('returns portions and route quota to the week', () => {
    const base = existing(120);
    const target = base[0]!;
    expect(weekPortionsUsed(base, WEEK)).toBe(600);
    const cancelled = cancelOrder(target, local(2026, 11, 10, 8, 0));
    expect(cancelled).toMatchObject({ status: 'cancelled', updatedAt: local(2026, 11, 10, 8, 0), version: 2 });
    const after = [cancelled, ...base.slice(1)];
    expect(weekPortionsUsed(after, WEEK)).toBe(595);
    const { order } = placeOrder(request({ plan: 5 }), ctx({ routeQuotas: BIG_ROUTES, existingOrders: after }));
    expect(order.weekId).toBe(WEEK);
  });

  it('does not mutate the input and is idempotent on a cancelled order', () => {
    const [target] = existing(1);
    const cancelled = cancelOrder(target!, 5);
    expect(target!.status).toBe('confirmed');
    expect(cancelOrder(cancelled, 9)).toBe(cancelled);
  });
});
