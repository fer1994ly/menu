import type { SettingsRepository } from '@/features/admin/application/ports';
import type { ChangeSummary } from '@/features/history/application/ChangeService';
import type { EventStore } from '@/features/history/application/ports';
import { createEventId, type HistoryEvent } from '@/features/history/domain/event';
import type { OrdersRepository } from '@/features/orders/application/ports';
import type { RecipesRepository } from '@/features/recipes/application/ports';
import type { SyncBus } from '@/shared/infrastructure/syncChannel';
import { randomId, type Clock } from '@/shared/kernel/runtime';
import type { PlanFailure, PlanResult, PlanSuccess } from '../domain/planProduction';
import type { PlanRecord } from '../domain/planRecord';
import { buildPlanInput, hashPlanInput, type BuiltPlanInput, type PlanningState } from './buildPlanInput';
import type { MenusRepository, PlanRunner, PlansRepository } from './ports';
import { stripTraces } from './planJob';
import { isPlanAffected, type PlanningConfig } from './staleness';
import { planProduction } from '../domain/planProduction';

export type CalculateOutcome =
  | { ok: true; record: PlanRecord; result: PlanSuccess; elapsedMs: number }
  | {
      ok: false;
      /** Message to show (briefing case 3 text for infeasible). */
      failure: PlanFailure;
      /** Previous plan of the week, kept untouched (null when there was none). */
      kept: PlanRecord | null;
      elapsedMs: number;
    };

export interface PlanServiceDeps {
  orders: OrdersRepository;
  recipes: RecipesRepository;
  menus: MenusRepository;
  settings: SettingsRepository;
  plans: PlansRepository;
  events: EventStore;
  runner: PlanRunner;
  clock: Clock;
  user: () => string;
  tabId: string;
  /** Tells the other tabs when a plan was written. */
  bus: SyncBus;
}

export class PlanService {
  constructor(private readonly deps: PlanServiceDeps) {}

  /** Loads what the plan of `weekId` depends on, from the repositories. */
  async loadState(weekId: string): Promise<PlanningState> {
    const [orders, recipes, menus, settings] = await Promise.all([
      this.deps.orders.listByWeek(weekId),
      this.deps.recipes.list(),
      this.deps.menus.list(),
      this.deps.settings.get(),
    ]);
    return { orders, recipes, menus, settings };
  }

  private async loadConfig(): Promise<PlanningConfig> {
    const [recipes, menus, settings] = await Promise.all([
      this.deps.recipes.list(),
      this.deps.menus.list(),
      this.deps.settings.get(),
    ]);
    return { recipes, menus, settings };
  }

  async buildInput(weekId: string): Promise<BuiltPlanInput> {
    return buildPlanInput(weekId, await this.loadState(weekId));
  }

  getRecord(weekId: string): Promise<PlanRecord | undefined> {
    return this.deps.plans.get(weekId);
  }

  listRecords(): Promise<PlanRecord[]> {
    return this.deps.plans.list();
  }

  /**
   * Runs the engine in the worker and persists the plan. When the model has no
   * solution the previous plan of the week is kept (briefing case 3).
   */
  async calculate(weekId: string): Promise<CalculateOutcome> {
    const built = await this.buildInput(weekId);
    const { result, elapsedMs } = await this.deps.runner.planWeek(built.input);
    const previous = (await this.deps.plans.get(weekId)) ?? null;

    if (result.status !== 'optimal') {
      if (previous === null) {
        await this.deps.plans.put(this.toRecord(weekId, built, result));
        this.announce(weekId, this.deps.clock());
      }
      return { ok: false, failure: result, kept: previous, elapsedMs };
    }

    // A change may have landed while the worker ran: never present such a plan as current.
    const fresh = await this.buildInput(weekId);
    const record = {
      ...this.toRecord(weekId, built, result),
      stale: hashPlanInput(fresh.input) !== hashPlanInput(built.input),
    };
    await this.deps.plans.put(record);
    await this.deps.events.append([this.calculatedEvent(weekId, previous, record)]);
    this.announce(weekId, record.computedAt);
    return { ok: true, record, result, elapsedMs };
  }

  /** Recalculates the stored weeks (default: every week with a plan) in the worker. */
  async recalculateHistory(weekIds?: readonly string[]): Promise<{ records: PlanRecord[]; elapsedMs: number; weeksRecalculated: number }> {
    const [orders, recipes, menus, settings] = await Promise.all([
      this.deps.orders.listAll(),
      this.deps.recipes.list(),
      this.deps.menus.list(),
      this.deps.settings.get(),
    ]);
    const existing = await this.deps.plans.list();
    const targets = weekIds ?? existing.map((r) => r.weekId);
    const byWeek = new Map<string, typeof orders>();
    for (const order of orders) {
      if (!targets.includes(order.weekId)) continue;
      const list = byWeek.get(order.weekId);
      if (list) list.push(order);
      else byWeek.set(order.weekId, [order]);
    }
    const built = targets.map((weekId) => ({
      weekId,
      built: buildPlanInput(weekId, { orders: byWeek.get(weekId) ?? [], recipes, menus, settings }),
    }));
    const { results, elapsedMs } = await this.deps.runner.recalculateHistory(
      built.map(({ weekId, built: b }) => ({ weekId, input: b.input })),
    );

    const previousByWeek = new Map(existing.map((r) => [r.weekId, r] as const));
    const records: PlanRecord[] = [];
    const events: HistoryEvent[] = [];
    for (const { weekId, outcome } of results) {
      const entry = built.find((b) => b.weekId === weekId);
      const previous = previousByWeek.get(weekId) ?? null;
      if (!entry) continue;
      if (outcome.status !== 'optimal' && previous !== null) continue; // keep the previous plan
      const record = this.toRecord(weekId, entry.built, outcome);
      records.push(record);
      if (outcome.status === 'optimal') events.push(this.calculatedEvent(weekId, previous, record));
    }
    await this.deps.plans.putMany(records);
    await this.deps.events.append(events);
    for (const record of records) this.announce(record.weekId, record.computedAt);
    // `records` holds the plans that were written; weeks without a feasible plan keep the previous one.
    return { records, elapsedMs, weeksRecalculated: results.length };
  }

  /** Full result with simplex traces, recomputed from the stored input (explanation screen). */
  async explain(weekId: string): Promise<PlanResult | null> {
    const record = await this.deps.plans.get(weekId);
    return record ? planProduction(record.input) : null;
  }

  /**
   * Marks the plans a change affects as «desactualizado» and logs `plan-stale`.
   * Register it with `ChangeService.addChangeListener`.
   */
  readonly onChange = async (change: ChangeSummary): Promise<void> => {
    const records = await this.deps.plans.list();
    const config =
      change.entity === 'order'
        ? { recipes: [], menus: [], settings: await this.deps.settings.get() }
        : await this.loadConfig();
    const events: HistoryEvent[] = [];
    const updated: PlanRecord[] = [];
    for (const record of records) {
      if (record.stale || !isPlanAffected(record, change, config)) continue;
      updated.push({ ...record, stale: true });
      events.push(
        this.event(record.weekId, change.atMs, 'stale', false, true, 'plan-stale', {
          cause: `${change.entity}:${change.entityId}`,
        }),
      );
    }
    await this.deps.plans.putMany(updated);
    await this.deps.events.append(events);
  };

  private announce(weekId: string, savedAt: number): void {
    this.deps.bus.publish({ type: 'changed', entity: 'plan', id: weekId, version: 0, savedAt, tabId: this.deps.tabId });
  }

  private toRecord(weekId: string, built: BuiltPlanInput, result: PlanResult | ReturnType<typeof stripTraces>): PlanRecord {
    const outcome = 'traces' in result ? stripTraces(result) : result;
    return {
      weekId,
      status: outcome.status,
      outcome,
      input: built.input,
      capSource: built.capSource,
      inputsHash: hashPlanInput(built.input),
      stale: false,
      computedAt: this.deps.clock(),
    };
  }

  private calculatedEvent(weekId: string, previous: PlanRecord | null, next: PlanRecord): HistoryEvent {
    const portions = (record: PlanRecord | null) =>
      record && record.outcome.status === 'optimal' ? record.outcome.integer : null;
    return this.event(weekId, next.computedAt, 'integer', portions(previous), portions(next), 'plan-calculated');
  }

  private event(
    weekId: string,
    at: number,
    field: string,
    oldValue: unknown,
    newValue: unknown,
    kind: HistoryEvent['kind'],
    meta?: Record<string, unknown>,
  ): HistoryEvent {
    return {
      id: createEventId(at, () => this.deps.tabId.slice(0, 6)),
      at: new Date(at).toISOString(),
      user: this.deps.user(),
      entity: 'plan',
      entityId: weekId,
      field,
      oldValue,
      newValue,
      kind,
      groupId: randomId(),
      ...(meta ? { meta } : {}),
    };
  }
}
