import { ROUTE_DEFINITIONS } from '@/features/routes/domain/routes';
import type { Order } from './order';

/**
 * Two-tab conflict rule for the same order.
 *
 * - Both versions saved at or before the close: the last saved wins.
 * - Exactly one saved before the close: that one wins (production was already
 *   calculated with it).
 * - Both saved after the close: the stored `base` version (saved before the close)
 *   stays, because neither late save may change a calculated week.
 *
 * Precision is whole seconds, like the close itself: a save at 11:30:00.999 is
 * still "at the close". The loser can be restored only while the close allows it.
 */

export interface SavedVersion {
  order: Order;
  /** Epoch ms of the save. */
  savedAt: number;
}

export interface ConflictInput {
  /** Stored version before either tab edited. */
  base: Order;
  /** Version of this tab. */
  mine: SavedVersion;
  /** Version of the other tab. */
  theirs: SavedVersion;
  closeInstant: number;
  /** Injected clock: decides whether choosing the other version is still allowed. */
  now: number;
}

export type ConflictReason = 'last-saved' | 'saved-before-close' | 'stored-before-close';
export type ConflictSide = 'mine' | 'theirs' | 'base';
export type ComparedField = 'plan' | 'route' | 'glutenFree' | 'status';

const COMPARED_FIELDS: readonly ComparedField[] = ['plan', 'route', 'glutenFree', 'status'];

export interface FieldChange {
  field: ComparedField;
  /** Display value in this tab. */
  mine: string;
  /** Display value in the other tab. */
  theirs: string;
}

export interface ConflictResolution {
  winner: Order;
  winnerSide: ConflictSide;
  loser: Order;
  reason: ConflictReason;
  /** True only while the close allows picking the other version (now ≤ close and it was saved ≤ close). */
  canChooseOther: boolean;
  /** Fields that differ between both tabs. */
  changedFields: FieldChange[];
  /** Spanish notice with both values. */
  notice: string;
}

export const CONFLICT_MESSAGES = {
  lastSaved: (code: string, mine: string, theirs: string, kept: string): string =>
    `Conflicto en el pedido ${code}: esta pestaña guardó «${mine}», la otra «${theirs}». Quedó «${kept}» porque se guardó último.`,
  savedBeforeClose: (code: string, mine: string, theirs: string, kept: string): string =>
    `Conflicto en el pedido ${code}: esta pestaña guardó «${mine}», la otra «${theirs}». Quedó «${kept}» porque se guardó antes del cierre y la producción ya se calculó con esa versión.`,
  storedBeforeClose: (code: string, mine: string, theirs: string, kept: string): string =>
    `Conflicto en el pedido ${code}: las dos pestañas guardaron después del cierre (esta «${mine}», la otra «${theirs}»). Quedó «${kept}» porque es la versión guardada antes del cierre.`,
} as const;

const truncateToSecond = (ms: number): number => Math.floor(ms / 1000) * 1000;

function routeText(order: Order): string {
  const label = ROUTE_DEFINITIONS[order.route].label;
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  return lower.startsWith('ruta') ? lower : `ruta ${lower}`;
}

function fieldText(order: Order, field: ComparedField): string {
  switch (field) {
    case 'plan':
      return `plan ${order.plan}`;
    case 'route':
      return routeText(order);
    case 'glutenFree':
      return order.glutenFree ? 'sin gluten' : 'con gluten';
    case 'status':
      return order.status === 'confirmed' ? 'confirmado' : 'cancelado';
  }
}

const describe = (order: Order, fields: readonly ComparedField[]): string =>
  fields.map((field) => fieldText(order, field)).join(', ');

export function resolveOrderConflict(input: ConflictInput): ConflictResolution {
  const { base, mine, theirs, closeInstant, now } = input;
  const mineOnTime = truncateToSecond(mine.savedAt) <= closeInstant;
  const theirsOnTime = truncateToSecond(theirs.savedAt) <= closeInstant;

  const changed = COMPARED_FIELDS.filter((field) => fieldText(mine.order, field) !== fieldText(theirs.order, field));
  const changedFields: FieldChange[] = changed.map((field) => ({
    field,
    mine: fieldText(mine.order, field),
    theirs: fieldText(theirs.order, field),
  }));
  const shown = changed.length > 0 ? changed : COMPARED_FIELDS;
  const mineText = describe(mine.order, shown);
  const theirsText = describe(theirs.order, shown);
  const code = base.code;
  const canChoose = (other: SavedVersion): boolean => now <= closeInstant && truncateToSecond(other.savedAt) <= closeInstant;

  if (mineOnTime && theirsOnTime) {
    // Equal save seconds: break the tie by display text so both tabs converge on the same winner.
    const mineWins =
      truncateToSecond(mine.savedAt) !== truncateToSecond(theirs.savedAt)
        ? mine.savedAt > theirs.savedAt
        : mineText > theirsText;
    const [winnerSide, winner, loser] = mineWins
      ? (['mine', mine, theirs] as const)
      : (['theirs', theirs, mine] as const);
    const kept = describe(winner.order, shown);
    return {
      winner: winner.order,
      winnerSide,
      loser: loser.order,
      reason: 'last-saved',
      canChooseOther: canChoose(loser),
      changedFields,
      notice: CONFLICT_MESSAGES.lastSaved(code, mineText, theirsText, kept),
    };
  }

  if (mineOnTime !== theirsOnTime) {
    const [winnerSide, winner, loser] = mineOnTime
      ? (['mine', mine, theirs] as const)
      : (['theirs', theirs, mine] as const);
    return {
      winner: winner.order,
      winnerSide,
      loser: loser.order,
      reason: 'saved-before-close',
      canChooseOther: false,
      changedFields,
      notice: CONFLICT_MESSAGES.savedBeforeClose(code, mineText, theirsText, describe(winner.order, shown)),
    };
  }

  // Both late: the stored version stays; report the later save as the discarded one.
  const loser = mine.savedAt > theirs.savedAt ? mine : theirs;
  return {
    winner: base,
    winnerSide: 'base',
    loser: loser.order,
    reason: 'stored-before-close',
    canChooseOther: false,
    changedFields,
    notice: CONFLICT_MESSAGES.storedBeforeClose(code, mineText, theirsText, describe(base, shown)),
  };
}
