export type EventEntity = 'order' | 'recipe' | 'settings' | 'menu' | 'plan';

export type EventKind =
  | 'change'
  | 'create'
  | 'cancel'
  | 'conflict'
  | 'undo'
  | 'redo'
  | 'plan-calculated'
  | 'plan-stale';

/**
 * Immutable record of one changed field. Events are only ever appended; undo and
 * redo append new compensating events instead of editing old ones.
 *
 * - `field` is a dotted path (`closeTime.hour`), `'*'` for a whole entity
 *   (create / delete) or `'_conflict'` for the conflict marker (never replayed).
 * - `id` sorts chronologically: `<epoch ms padded>-<sequence>-<random>`.
 */
export interface HistoryEvent {
  id: string;
  /** ISO-8601 UTC instant. */
  at: string;
  user: string;
  entity: EventEntity;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  kind: EventKind;
  /** Events produced by one user action share the group id. */
  groupId?: string;
  meta?: Record<string, unknown>;
}

export const WHOLE_ENTITY = '*';
export const CONFLICT_MARKER = '_conflict';

const ID_TIME_WIDTH = 15;
let sequence = 0;

/** Chronologically sortable event id. */
export function createEventId(atMs: number, random: () => string): string {
  sequence = (sequence + 1) % 1_000_000;
  return `${String(atMs).padStart(ID_TIME_WIDTH, '0')}-${String(sequence).padStart(6, '0')}-${random()}`;
}

/** Lowest id that can exist at `atMs`. */
export const eventIdLowerBound = (atMs: number): string => String(atMs).padStart(ID_TIME_WIDTH, '0');
/** Id greater than every id created at or before `atMs` (`~` sorts after digits, hyphen and letters). */
export const eventIdUpperBound = (atMs: number): string => `${String(atMs).padStart(ID_TIME_WIDTH, '0')}~`;
