import type { EventEntity, EventKind, HistoryEvent } from '../domain/event';
import { CONFLICT_MARKER, WHOLE_ENTITY } from '../domain/event';

export const ENTITY_LABELS: Record<EventEntity, string> = {
  order: 'Pedido',
  recipe: 'Receta',
  settings: 'Ajustes',
  menu: 'Menú',
  plan: 'Plan',
};

export const KIND_LABELS: Record<EventKind, string> = {
  create: 'Alta',
  change: 'Cambio',
  cancel: 'Cancelación',
  conflict: 'Conflicto',
  undo: 'Deshacer',
  redo: 'Rehacer',
  'plan-calculated': 'Plan calculado',
  'plan-stale': 'Plan desactualizado',
};

/** `o-000123` is shown to people as `P-000123`. */
export function entityName(event: Pick<HistoryEvent, 'entity' | 'entityId'>): string {
  const id = event.entity === 'order' ? event.entityId.replace(/^o-/, 'P-') : event.entityId;
  return `${ENTITY_LABELS[event.entity]} ${id}`;
}

const MAX_VALUE_LENGTH = 90;

export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

export function fieldText(event: Pick<HistoryEvent, 'field'>): string {
  return event.field === WHOLE_ENTITY ? '(registro completo)' : event.field;
}

export const isConflictMarker = (event: Pick<HistoryEvent, 'field'>): boolean => event.field === CONFLICT_MARKER;

/** Order code typed by a person (`P-123`, `p-000123`) or recipe code (`r1`) to the stored entity id. */
export function toEntityId(text: string): string | undefined {
  const value = text.trim();
  if (value === '') return undefined;
  const order = /^p-?(\d+)$/i.exec(value);
  if (order) return `o-${(order[1] as string).padStart(6, '0')}`;
  return /^r\d+$/i.test(value) ? value.toUpperCase() : value;
}
