import type { PlanRecord } from '../domain/planRecord';

export type PlanStatusLabel = 'sin calcular' | 'calculado' | 'desactualizado' | 'sin solución';

/** Status badge text shown on the home and plan screens. */
export function planStatusLabel(record: PlanRecord | undefined | null): PlanStatusLabel {
  if (!record) return 'sin calcular';
  if (record.stale) return 'desactualizado';
  return record.outcome.status === 'optimal' ? 'calculado' : 'sin solución';
}
