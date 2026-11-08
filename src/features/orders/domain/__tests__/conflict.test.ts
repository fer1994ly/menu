import { describe, expect, it } from 'vitest';
import { CONFLICT_MESSAGES, resolveOrderConflict } from '../conflict';
import type { Order } from '../order';

const CLOSE = Date.UTC(2026, 10, 14, 17, 30, 0); // Saturday 11:30 Monterrey
const MIN = 60_000;

const base: Order = {
  id: 'o1',
  code: 'P-000123',
  clientId: 'c1',
  clientName: 'Ana',
  plan: 5,
  portions: 5,
  glutenFree: false,
  route: 'open',
  weekId: '2026-11-15',
  status: 'confirmed',
  routeChargeCents: 0,
  createdAt: 0,
  updatedAt: 0,
  version: 1,
};

const plan10: Order = { ...base, plan: 10, portions: 10, version: 2 };
const plan5Morning: Order = { ...base, route: 'morning', routeChargeCents: 9900, version: 2 };

describe('resolveOrderConflict: both saved before close', () => {
  it('last saved wins and the other version can still be chosen before close', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE - 10 * MIN },
      theirs: { order: { ...base, plan: 5, glutenFree: false, version: 2 }, savedAt: CLOSE - 5 * MIN },
      closeInstant: CLOSE,
      now: CLOSE - 2 * MIN,
    });
    expect(result.reason).toBe('last-saved');
    expect(result.winnerSide).toBe('theirs');
    expect(result.winner.plan).toBe(5);
    expect(result.loser.plan).toBe(10);
    expect(result.canChooseOther).toBe(true);
    expect(result.changedFields).toEqual([{ field: 'plan', mine: 'plan 10', theirs: 'plan 5' }]);
    expect(result.notice).toBe(
      'Conflicto en el pedido P-000123: esta pestaña guardó «plan 10», la otra «plan 5». Quedó «plan 5» porque se guardó último.',
    );
    expect(result.notice).toBe(CONFLICT_MESSAGES.lastSaved('P-000123', 'plan 10', 'plan 5', 'plan 5'));
  });

  it('my later save wins over theirs', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE - MIN },
      theirs: { order: plan5Morning, savedAt: CLOSE - 5 * MIN },
      closeInstant: CLOSE,
      now: CLOSE - MIN,
    });
    expect(result.winnerSide).toBe('mine');
    expect(result.winner).toBe(plan10);
    expect(result.changedFields.map((c) => c.field)).toEqual(['plan', 'route']);
  });

  it('cannot choose the other version once the close has passed', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE - 2 * MIN },
      theirs: { order: plan5Morning, savedAt: CLOSE - MIN },
      closeInstant: CLOSE,
      now: CLOSE + MIN,
    });
    expect(result.reason).toBe('last-saved');
    expect(result.canChooseOther).toBe(false);
  });

  it('breaks an exact tie symmetrically in both tabs', () => {
    const a = { order: plan10, savedAt: CLOSE - MIN };
    const b = { order: plan5Morning, savedAt: CLOSE - MIN };
    const fromA = resolveOrderConflict({ base, mine: a, theirs: b, closeInstant: CLOSE, now: CLOSE - 1 });
    const fromB = resolveOrderConflict({ base, mine: b, theirs: a, closeInstant: CLOSE, now: CLOSE - 1 });
    expect(fromA.winner).toBe(fromB.winner);
  });

  it('treats a save at exactly the close second as before close', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE + 999 },
      theirs: { order: plan5Morning, savedAt: CLOSE - MIN },
      closeInstant: CLOSE,
      now: CLOSE,
    });
    expect(result.reason).toBe('last-saved');
    expect(result.winnerSide).toBe('mine');
  });
});

describe('resolveOrderConflict: a save after close', () => {
  it('keeps the version saved before close when mine is late', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE + 2 * MIN },
      theirs: { order: plan5Morning, savedAt: CLOSE - 3 * MIN },
      closeInstant: CLOSE,
      now: CLOSE + 3 * MIN,
    });
    expect(result.reason).toBe('saved-before-close');
    expect(result.winnerSide).toBe('theirs');
    expect(result.winner).toBe(plan5Morning);
    expect(result.loser).toBe(plan10);
    expect(result.canChooseOther).toBe(false);
    expect(result.notice).toBe(
      'Conflicto en el pedido P-000123: esta pestaña guardó «plan 10, ruta abierta 8:00–17:00», la otra «plan 5, ruta mañana 8:00–12:00». Quedó «plan 5, ruta mañana 8:00–12:00» porque se guardó antes del cierre y la producción ya se calculó con esa versión.',
    );
  });

  it('keeps my version when theirs is the late one', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE - MIN },
      theirs: { order: plan5Morning, savedAt: CLOSE + MIN },
      closeInstant: CLOSE,
      now: CLOSE + 5 * MIN,
    });
    expect(result.winnerSide).toBe('mine');
    expect(result.reason).toBe('saved-before-close');
    expect(result.canChooseOther).toBe(false);
  });

  it('keeps the stored (base) version when both saves are after close', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: plan10, savedAt: CLOSE + MIN },
      theirs: { order: plan5Morning, savedAt: CLOSE + 2 * MIN },
      closeInstant: CLOSE,
      now: CLOSE + 3 * MIN,
    });
    expect(result.reason).toBe('stored-before-close');
    expect(result.winnerSide).toBe('base');
    expect(result.winner).toBe(base);
    expect(result.loser).toBe(plan5Morning);
    expect(result.canChooseOther).toBe(false);
    expect(result.notice).toBe(
      'Conflicto en el pedido P-000123: las dos pestañas guardaron después del cierre (esta «plan 10, ruta abierta 8:00–17:00», la otra «plan 5, ruta mañana 8:00–12:00»). Quedó «plan 5, ruta abierta 8:00–17:00» porque es la versión guardada antes del cierre.',
    );
  });
});

describe('resolveOrderConflict: value descriptions', () => {
  it('describes gluten and status changes', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: { ...base, glutenFree: true, version: 2 }, savedAt: CLOSE - 2 * MIN },
      theirs: { order: { ...base, status: 'cancelled', version: 2 }, savedAt: CLOSE - MIN },
      closeInstant: CLOSE,
      now: CLOSE - MIN,
    });
    expect(result.changedFields).toEqual([
      { field: 'glutenFree', mine: 'sin gluten', theirs: 'con gluten' },
      { field: 'status', mine: 'confirmado', theirs: 'cancelado' },
    ]);
  });

  it('still produces a notice when the versions do not differ', () => {
    const result = resolveOrderConflict({
      base,
      mine: { order: base, savedAt: CLOSE - 2 * MIN },
      theirs: { order: base, savedAt: CLOSE - MIN },
      closeInstant: CLOSE,
      now: CLOSE - MIN,
    });
    expect(result.changedFields).toEqual([]);
    expect(result.notice).toContain('P-000123');
  });
});

describe('resolveOrderConflict: close precision is whole seconds', () => {
  const input = (now: number) => ({
    base,
    mine: { order: plan10, savedAt: CLOSE - 10 * MIN },
    theirs: { order: plan5Morning, savedAt: CLOSE - 5 * MIN },
    closeInstant: CLOSE,
    now,
  });

  it('still allows choosing the other value at 11:30:00.999', () => {
    expect(resolveOrderConflict(input(CLOSE + 999)).canChooseOther).toBe(true);
  });

  it('stops allowing it from 11:30:01', () => {
    expect(resolveOrderConflict(input(CLOSE + 1000)).canChooseOther).toBe(false);
  });
});
