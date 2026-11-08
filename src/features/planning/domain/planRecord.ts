import type { PlanFailure, PlanInput, PlanSuccess } from './planProduction';

/** A plan result without the (large) simplex traces: what gets stored. */
export type PlanOutcome = Omit<PlanSuccess, 'traces'> | Omit<PlanFailure, 'traces'>;

export type CapSource = 'menu' | 'settings';

/** Last plan computed for a week. */
export interface PlanRecord {
  weekId: string;
  status: PlanOutcome['status'];
  outcome: PlanOutcome;
  /** Exact input used; lets the explanation screen replay the simplex. */
  input: PlanInput;
  capSource: { chicken: CapSource; beef: CapSource };
  inputsHash: string;
  /** True when something the plan depended on changed after it was computed. */
  stale: boolean;
  /** Epoch ms. */
  computedAt: number;
}
