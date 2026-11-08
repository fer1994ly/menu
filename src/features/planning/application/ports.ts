import type { PlanInput, PlanResult } from '../domain/planProduction';
import type { WeekMenu } from '../domain/menu';
import type { PlanOutcome, PlanRecord } from '../domain/planRecord';

export interface MenusRepository {
  get(weekId: string): Promise<WeekMenu | undefined>;
  list(): Promise<WeekMenu[]>;
  put(menu: WeekMenu): Promise<void>;
  putMany(menus: readonly WeekMenu[]): Promise<void>;
  delete(weekId: string): Promise<void>;
}

export interface PlansRepository {
  get(weekId: string): Promise<PlanRecord | undefined>;
  list(): Promise<PlanRecord[]>;
  put(record: PlanRecord): Promise<void>;
  putMany(records: readonly PlanRecord[]): Promise<void>;
}

export interface WeekPlanInput {
  weekId: string;
  input: PlanInput;
}

export interface WeekPlanOutcome {
  weekId: string;
  outcome: PlanOutcome;
}

/** Runs the planning engine off the main thread (or inline where Workers do not exist). */
export interface PlanRunner {
  planWeek(input: PlanInput): Promise<{ result: PlanResult; elapsedMs: number }>;
  recalculateHistory(inputs: readonly WeekPlanInput[]): Promise<{ results: WeekPlanOutcome[]; elapsedMs: number }>;
  dispose(): void;
}
