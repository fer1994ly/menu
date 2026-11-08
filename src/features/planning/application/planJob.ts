import { planProduction, type PlanInput, type PlanResult } from '../domain/planProduction';
import type { PlanOutcome } from '../domain/planRecord';
import type { WeekPlanInput, WeekPlanOutcome } from './ports';

export type PlanJob =
  | { kind: 'planWeek'; input: PlanInput }
  | { kind: 'recalculateHistory'; inputs: readonly WeekPlanInput[] };

export type PlanJobResult =
  | { kind: 'planWeek'; result: PlanResult; elapsedMs: number }
  | { kind: 'recalculateHistory'; results: WeekPlanOutcome[]; elapsedMs: number };

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Drops the simplex traces: what gets stored and sent back for bulk jobs. */
export function stripTraces(result: PlanResult): PlanOutcome {
  const { traces: _traces, ...rest } = result;
  void _traces;
  return rest;
}

/**
 * The whole job, as a plain function. The Web Worker is a thin adapter over it,
 * so it is unit-testable without a Worker.
 */
export function runPlanJob(job: PlanJob): PlanJobResult {
  const started = now();
  if (job.kind === 'planWeek') {
    const result = planProduction(job.input);
    return { kind: 'planWeek', result, elapsedMs: now() - started };
  }
  const results = job.inputs.map(({ weekId, input }) => ({ weekId, outcome: stripTraces(planProduction(input)) }));
  return { kind: 'recalculateHistory', results, elapsedMs: now() - started };
}

/** Messages exchanged with the worker. */
export interface WorkerRequest {
  id: number;
  job: PlanJob;
}
export type WorkerResponse = { id: number; result: PlanJobResult } | { id: number; error: string };
