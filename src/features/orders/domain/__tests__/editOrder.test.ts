import { describe, expect, it } from 'vitest';
import { checkOrderCapacity, checkWeekOpen } from '../editOrder';
import { ORDER_MESSAGES } from '../messages';
import type { Order } from '../order';

const WEEK = '2026-11-15';
const QUOTAS = { open: 2, morning: 1, afternoon: 1 };

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o-1',
  code: 'P-000001',
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
});

const CLOSE = Date.UTC(2026, 10, 14, 17, 30, 0); // Saturday 11:30 Monterrey

describe('checkWeekOpen', () => {
  it('allows edits up to and including the close second', () => {
    expect(checkWeekOpen(order(), CLOSE + 999, { hour: 11, minute: 30 })).toBeNull();
  });

  it('rejects edits after the configured close with the explanatory notice', () => {
    const rejection = checkWeekOpen(order({ code: 'P-000123' }), CLOSE + 1000, { hour: 11, minute: 30 });
    expect(rejection).toEqual({ reason: 'week-closed', message: ORDER_MESSAGES.weekClosed('P-000123', '11:30') });
    expect(rejection?.message).toBe(
      'El pedido P-000123 es de una semana cerrada el sábado a las 11:30: ya no se puede cambiar porque la producción se calculó con él.',
    );
  });

  it('uses the configured close time, not the default', () => {
    const late = { hour: 14, minute: 0 };
    expect(checkWeekOpen(order(), CLOSE + 60_000, late)).toBeNull();
    expect(checkWeekOpen(order(), CLOSE + 3 * 3_600_000, late)?.reason).toBe('week-closed');
  });
});

describe('checkOrderCapacity', () => {
  const ctx = (others: Order[]) => ({ others, weeklyPortionQuota: 10, routeQuotas: QUOTAS });

  it('rejects a plan increase that does not fit the weekly quota', () => {
    const stored = order();
    const others = [order({ id: 'x', portions: 5, plan: 5 })];
    const edited = { ...stored, plan: 10 as const, portions: 10 };
    const rejection = checkOrderCapacity(stored, edited, ctx(others));
    expect(rejection?.reason).toBe('plan-quota');
    expect(rejection?.message).toBe(ORDER_MESSAGES.editPlanQuota('P-000001', 10, 5));
  });

  it('accepts a plan increase that fits', () => {
    const stored = order();
    expect(checkOrderCapacity(stored, { ...stored, plan: 10, portions: 10 }, ctx([]))).toBeNull();
  });

  it('does not re-check the quota when the plan did not grow', () => {
    const stored = order({ plan: 10, portions: 10 });
    const others = [order({ id: 'x', plan: 10, portions: 10 })];
    expect(checkOrderCapacity(stored, { ...stored, glutenFree: true }, ctx(others))).toBeNull();
  });

  it('rejects moving to a full route', () => {
    const stored = order();
    const others = [order({ id: 'x', route: 'morning' })];
    const rejection = checkOrderCapacity(stored, { ...stored, route: 'morning' }, ctx(others));
    expect(rejection?.reason).toBe('route-full');
    expect(rejection?.message).toBe(ORDER_MESSAGES.editRouteFull('P-000001', 'morning'));
  });

  it('accepts moving to a route with room, ignoring cancelled orders and other weeks', () => {
    const stored = order();
    const others = [order({ id: 'x', route: 'morning', status: 'cancelled' }), order({ id: 'y', route: 'morning', weekId: '2026-11-22' })];
    expect(checkOrderCapacity(stored, { ...stored, route: 'morning' }, ctx(others))).toBeNull();
  });

  it('checks both quotas when reactivating a cancelled order', () => {
    const stored = order({ status: 'cancelled' });
    const full = [order({ id: 'x', portions: 10, plan: 10 })];
    expect(checkOrderCapacity(stored, { ...stored, status: 'confirmed' }, ctx(full))?.reason).toBe('plan-quota');
  });

  it('never blocks a cancellation', () => {
    const stored = order();
    const full = [order({ id: 'x', portions: 10, plan: 10 })];
    expect(checkOrderCapacity(stored, { ...stored, status: 'cancelled' }, ctx(full))).toBeNull();
  });
});
