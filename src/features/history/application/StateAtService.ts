import type { SettingsRepository } from '@/features/admin/application/ports';
import type { Settings } from '@/features/admin/domain/settings';
import type { OrdersRepository } from '@/features/orders/application/ports';
import type { Order } from '@/features/orders/domain/order';
import { buildPlanInput } from '@/features/planning/application/buildPlanInput';
import type { MenusRepository, PlanRunner } from '@/features/planning/application/ports';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { PlanInput, PlanResult } from '@/features/planning/domain/planProduction';
import type { RecipePortions } from '@/features/planning/domain/types';
import type { RecipesRepository } from '@/features/recipes/application/ports';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import { setPath } from '../domain/diff';
import { WHOLE_ENTITY, type HistoryEvent } from '../domain/event';
import type { EventStore, SnapshotStore } from './ports';

export const BEFORE_FIRST_RECORD = 'Antes del primer registro';

export interface StateAt {
  /** Epoch ms the state reflects. */
  at: number;
  orders: Order[];
  recipes: RecipeEntity[];
  settings: Settings;
  menus: WeekMenu[];
  /** «Antes del primer registro» when no event existed yet at that instant. */
  notice?: string;
}

export interface PlanAtResult {
  weekId: string;
  at: number;
  input: PlanInput;
  result: PlanResult;
  /** Portions that would have been cooked (empty when there was no plan). */
  portions: RecipePortions[];
  /** Confirmed orders of the week known at that instant. */
  orderCount: number;
  notice?: string;
}

export interface StateAtDeps {
  orders: OrdersRepository;
  recipes: RecipesRepository;
  menus: MenusRepository;
  settings: SettingsRepository;
  events: EventStore;
  snapshots: SnapshotStore;
  runner: PlanRunner;
}

const isMarker = (event: HistoryEvent): boolean => event.field.startsWith('_');

function applyForward<T>(state: T | null, event: HistoryEvent): T | null {
  if (isMarker(event)) return state;
  if (event.field === WHOLE_ENTITY) return (event.newValue as T | null) ?? null;
  return state === null ? null : setPath(state, event.field, event.newValue);
}

function applyBackward<T>(state: T | null, event: HistoryEvent): T | null {
  if (isMarker(event)) return state;
  if (event.field === WHOLE_ENTITY) return (event.oldValue as T | null) ?? null;
  return state === null ? null : setPath(state, event.field, event.oldValue);
}

/**
 * «Estado al…»: snapshot (recipes, menus, settings) + replay of the events up to
 * the instant. Orders are not snapshotted (26.000+ records): an order nobody
 * touched is read from the store (seed orders filtered by `createdAt ≤ at`);
 * an order with events is rebuilt by undoing all its events from the stored
 * version and replaying forward up to the instant.
 */
export class StateAtService {
  constructor(private readonly deps: StateAtDeps) {}

  async reconstruct(at: number, options: { weekId?: string } = {}): Promise<StateAt> {
    const first = await this.deps.events.first();
    const notice = first === undefined || Date.parse(first.at) > at ? BEFORE_FIRST_RECORD : undefined;

    const snapshot = await this.deps.snapshots.latestAtOrBefore(at);
    const base = snapshot ?? {
      recipes: await this.deps.recipes.list(),
      menus: await this.deps.menus.list(),
      settings: await this.deps.settings.get(),
      lastEventId: undefined,
    };
    // Without any snapshot the stores already hold the only state there is: nothing to replay.
    const replay = snapshot
      ? await this.deps.events.listAscending({ afterId: snapshot.lastEventId || undefined, untilMs: at })
      : [];

    const recipes = new Map<string, RecipeEntity | null>(base.recipes.map((r) => [r.code, r]));
    const menus = new Map<string, WeekMenu | null>(base.menus.map((m) => [m.weekId, m]));
    let settings: Settings | null = base.settings;
    for (const event of replay) {
      if (event.entity === 'recipe') recipes.set(event.entityId, applyForward(recipes.get(event.entityId) ?? null, event));
      else if (event.entity === 'menu') menus.set(event.entityId, applyForward(menus.get(event.entityId) ?? null, event));
      else if (event.entity === 'settings') settings = applyForward(settings, event);
    }

    const orders = await this.ordersAt(at, options.weekId);
    return {
      at,
      orders,
      recipes: [...recipes.values()].filter((r): r is RecipeEntity => r !== null),
      settings: settings as Settings,
      menus: [...menus.values()].filter((m): m is WeekMenu => m !== null),
      ...(notice ? { notice } : {}),
    };
  }

  /** Plan that would have been calculated with what was known at `at` (portions that would have been cooked). */
  async planAt(weekId: string, at: number): Promise<PlanAtResult> {
    const state = await this.reconstruct(at, { weekId });
    const { input } = buildPlanInput(weekId, state);
    const { result } = await this.deps.runner.planWeek(input);
    return {
      weekId,
      at,
      input,
      result,
      portions: result.status === 'optimal' ? result.integer : [],
      orderCount: state.orders.filter((o) => o.weekId === weekId && o.status === 'confirmed').length,
      ...(state.notice ? { notice: state.notice } : {}),
    };
  }

  private async ordersAt(at: number, weekId: string | undefined): Promise<Order[]> {
    const orderEvents = await this.deps.events.listAscending({ entity: 'order' });
    const byOrder = new Map<string, HistoryEvent[]>();
    for (const event of orderEvents) {
      const list = byOrder.get(event.entityId);
      if (list) list.push(event);
      else byOrder.set(event.entityId, [event]);
    }

    const stored = weekId ? await this.deps.orders.listByWeek(weekId) : await this.deps.orders.listAll();
    const result: Order[] = stored.filter((o) => !byOrder.has(o.id) && o.createdAt <= at);

    for (const [id, events] of byOrder) {
      let state: Order | null = (await this.deps.orders.get(id)) ?? null;
      for (let i = events.length - 1; i >= 0; i -= 1) state = applyBackward(state, events[i] as HistoryEvent);
      for (const event of events) {
        if (Date.parse(event.at) > at) break;
        state = applyForward(state, event);
      }
      if (state !== null && state.createdAt <= at && (weekId === undefined || state.weekId === weekId)) result.push(state);
    }
    return result;
  }
}
