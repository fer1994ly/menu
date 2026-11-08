import type { SettingsRepository } from '@/features/admin/application/ports';
import { validateSettings, type Settings } from '@/features/admin/domain/settings';
import type { OrdersRepository } from '@/features/orders/application/ports';
import { resolveOrderConflict, type ConflictResolution } from '@/features/orders/domain/conflict';
import { checkOrderCapacity, checkWeekOpen, type OrderEditRejection } from '@/features/orders/domain/editOrder';
import type { Order } from '@/features/orders/domain/order';
import type { MenusRepository } from '@/features/planning/application/ports';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { RecipesRepository } from '@/features/recipes/application/ports';
import { validateRecipe, type RecipeEntity } from '@/features/recipes/domain/recipe';
import { randomId, type Clock } from '@/shared/kernel/runtime';
import { closeInstantForWeek, isWeekClosed, weekIdForInstant } from '@/shared/kernel/time';
import type { SyncBus } from '@/shared/infrastructure/syncChannel';
import { diffFields, sameData } from '../domain/diff';
import { CONFLICT_MARKER, createEventId, WHOLE_ENTITY, type EventEntity, type EventKind, type HistoryEvent } from '../domain/event';
import type { EventStore, SnapshotStore } from './ports';

export const MAX_UNDO_STEPS = 50;
export const UNDO_EXHAUSTED_MESSAGE = 'No hay más pasos para deshacer (máximo 50)';
export const REDO_EMPTY_MESSAGE = 'No hay pasos para rehacer';

type MutableEntity = Exclude<EventEntity, 'plan'>;
type EntityValue = Order | RecipeEntity | Settings | WeekMenu;
export type ChangeOrigin = 'user' | 'undo' | 'redo' | 'conflict';

/** Settings are a singleton: this is its entity id. */
export const SETTINGS_ENTITY_ID = 'main';

/** What listeners (stale plan detection, UI refresh) learn about each mutation. */
export interface ChangeSummary {
  entity: MutableEntity;
  entityId: string;
  before: EntityValue | null;
  after: EntityValue | null;
  user: string;
  atMs: number;
  at: string;
  origin: ChangeOrigin;
}

export type ChangeListener = (change: ChangeSummary) => Promise<void> | void;

interface Mutation {
  entity: MutableEntity;
  entityId: string;
  before: EntityValue | null;
  after: EntityValue | null;
}

/** A recorded mutation plus the value the store holds since it was last applied (what undo/redo expect to find). */
interface UndoStep extends Mutation {
  applied: EntityValue | null;
}

interface UndoGroup {
  label: string;
  mutations: UndoStep[];
}

/** Result of an undo / redo request. A refused step changed nothing; `message` says why. */
export type UndoOutcome =
  | { status: 'done'; label: string }
  | { status: 'empty' }
  | { status: 'refused'; message: string };

interface Refusal {
  message: string;
  /** Keep the step on its stack (the blocker can go away, e.g. quota) instead of dropping it. */
  keep: boolean;
}

export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  maxSteps: number;
  /** Text to show next to the disabled undo button; null while undo is available. */
  undoDisabledReason: string | null;
  redoDisabledReason: string | null;
  undoLabel: string | null;
  redoLabel: string | null;
}

export type SaveResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export type SaveOrderOutcome =
  | { status: 'saved'; order: Order }
  | { status: 'conflict'; order: Order; resolution: ConflictResolution }
  /** The edit was refused and nothing changed; `message` is the Spanish text for the operator. */
  | ({ status: 'rejected' } & OrderEditRejection);

export interface ChangeServiceDeps {
  orders: OrdersRepository;
  recipes: RecipesRepository;
  settings: SettingsRepository;
  menus: MenusRepository;
  events: EventStore;
  snapshots: SnapshotStore;
  bus: SyncBus;
  clock: Clock;
  /** Operator name of this tab. */
  user: () => string;
  tabId: string;
}

/**
 * THE way to mutate orders, recipes, settings and menus: persists the change,
 * appends one immutable event per changed field, tells the other tabs, feeds the
 * per-tab undo/redo stack (50 steps) and notifies listeners.
 */
export class ChangeService {
  private undoStack: UndoGroup[] = [];
  private redoStack: UndoGroup[] = [];
  private readonly listeners = new Set<ChangeListener>();
  private readonly undoListeners = new Set<(state: UndoState) => void>();

  constructor(private readonly deps: ChangeServiceDeps) {}

  // ---- subscriptions -------------------------------------------------------

  addChangeListener(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onUndoStateChange(listener: (state: UndoState) => void): () => void {
    this.undoListeners.add(listener);
    return () => this.undoListeners.delete(listener);
  }

  getUndoState(): UndoState {
    const canUndo = this.undoStack.length > 0;
    const canRedo = this.redoStack.length > 0;
    return {
      canUndo,
      canRedo,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      maxSteps: MAX_UNDO_STEPS,
      undoDisabledReason: canUndo ? null : UNDO_EXHAUSTED_MESSAGE,
      redoDisabledReason: canRedo ? null : REDO_EMPTY_MESSAGE,
      undoLabel: this.undoStack[this.undoStack.length - 1]?.label ?? null,
      redoLabel: this.redoStack[this.redoStack.length - 1]?.label ?? null,
    };
  }

  /** Forget the undo/redo stacks (after «Restaurar datos de ejemplo»). */
  resetUndo(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitUndoState();
  }

  // ---- orders --------------------------------------------------------------

  /** Persists a new order produced by `placeOrder`. */
  async createOrder(order: Order): Promise<Order> {
    const at = this.deps.clock();
    const mutation: Mutation = { entity: 'order', entityId: order.id, before: null, after: order };
    await this.commit(mutation, 'user', at);
    this.record(`Pedido ${order.code} creado`, mutation);
    return order;
  }

  /**
   * Optimistic save: `loaded` is the version this tab read. When the stored
   * version moved on (another tab saved), the conflict rule decides the winner.
   *
   * Edits are refused (typed `rejected` outcome, nothing written) when the order's
   * week already closed, when a plan increase does not fit the weekly quota, or
   * when the order is moved to a full route. A stale `loaded` version skips only
   * the closed-week refusal: the conflict rule already keeps the version saved
   * before the close.
   */
  async saveOrder(loaded: Order, edited: Order): Promise<SaveOrderOutcome> {
    const stored = await this.deps.orders.get(loaded.id);
    if (!stored) throw new Error(`Order ${loaded.id} does not exist`);
    const at = this.deps.clock();
    const settings = await this.deps.settings.get();

    if (stored.version === loaded.version) {
      const closed = checkWeekOpen(stored, at, settings.closeTime);
      if (closed) return { status: 'rejected', ...closed };
    }
    const normalized = this.normalizeEdit(stored, edited, settings);
    const refused = await this.checkCapacity(stored, normalized, settings);
    if (refused) return { status: 'rejected', ...refused };

    if (stored.version === loaded.version) {
      const next: Order = { ...normalized, id: stored.id, version: stored.version + 1, updatedAt: at };
      const mutation: Mutation = { entity: 'order', entityId: stored.id, before: stored, after: next };
      await this.commit(mutation, 'user', at);
      this.record(
        next.status === 'cancelled' && stored.status !== 'cancelled' ? `Pedido ${next.code} cancelado` : `Pedido ${next.code} modificado`,
        mutation,
      );
      return { status: 'saved', order: next };
    }
    return this.resolveConflict(loaded, normalized, stored, at);
  }

  /** Portions always follow the plan; the route surcharge follows the route (kept while the route is unchanged). */
  private normalizeEdit(stored: Order, edited: Order, settings: Settings): Order {
    const routeChargeCents =
      edited.route === stored.route ? stored.routeChargeCents : edited.route === 'open' ? 0 : settings.routeChargeCents;
    return { ...edited, portions: edited.plan, routeChargeCents };
  }

  private async checkCapacity(stored: Order, edited: Order, settings: Settings): Promise<OrderEditRejection | null> {
    const others = (await this.deps.orders.listByWeek(stored.weekId)).filter((o) => o.id !== stored.id);
    return checkOrderCapacity(stored, edited, {
      others,
      weeklyPortionQuota: settings.weeklyPortionQuota,
      routeQuotas: settings.routeQuotas,
    });
  }

  cancelOrder(loaded: Order): Promise<SaveOrderOutcome> {
    return this.saveOrder(loaded, { ...loaded, status: 'cancelled' });
  }

  /**
   * «Elegir el otro valor»: saves the version that lost the conflict as a normal
   * change, only while the close still allows it.
   */
  async chooseOtherOrderValue(resolution: ConflictResolution): Promise<SaveOrderOutcome | null> {
    const stored = await this.deps.orders.get(resolution.winner.id);
    if (!stored || !resolution.canChooseOther) return null;
    const { closeTime } = await this.deps.settings.get();
    if (isWeekClosed(stored.weekId, this.deps.clock(), closeTime)) return null;
    return this.saveOrder(stored, { ...resolution.loser });
  }

  // ---- recipes, settings, menus -------------------------------------------

  async saveRecipe(recipe: RecipeEntity): Promise<SaveResult<RecipeEntity>> {
    const errors = validateRecipe(recipe);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const before = (await this.deps.recipes.get(recipe.code)) ?? null;
    const mutation: Mutation = { entity: 'recipe', entityId: recipe.code, before, after: recipe };
    await this.commit(mutation, 'user', this.deps.clock());
    this.record(before ? `Receta ${recipe.code} modificada` : `Receta ${recipe.code} creada`, mutation);
    return { ok: true, value: recipe };
  }

  async saveSettings(next: Settings): Promise<SaveResult<Settings>> {
    const errors = validateSettings(next);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const before = await this.deps.settings.get();
    const mutation: Mutation = { entity: 'settings', entityId: SETTINGS_ENTITY_ID, before, after: next };
    await this.commit(mutation, 'user', this.deps.clock());
    this.record('Ajustes modificados', mutation);
    return { ok: true, value: next };
  }

  /** Menu of a week: recipes and the chicken / beef caps of that week. */
  async saveMenu(menu: WeekMenu): Promise<SaveResult<WeekMenu>> {
    const errors: Record<string, string> = {};
    if (menu.chickenCapG !== undefined && !(menu.chickenCapG >= 0)) errors.chickenCapG = 'Valor fuera de rango';
    if (menu.beefCapG !== undefined && !(menu.beefCapG >= 0)) errors.beefCapG = 'Valor fuera de rango';
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const before = (await this.deps.menus.get(menu.weekId)) ?? null;
    const mutation: Mutation = { entity: 'menu', entityId: menu.weekId, before, after: menu };
    await this.commit(mutation, 'user', this.deps.clock());
    this.record(`Menú de la semana ${menu.weekId} modificado`, mutation);
    return { ok: true, value: menu };
  }

  // ---- undo / redo ---------------------------------------------------------

  /**
   * Applies the inverse of the last action and appends `undo` events. Refused (nothing
   * written) when another tab changed the entity since, when the order's week closed,
   * or when restoring an order no longer fits the quotas.
   */
  async undo(): Promise<UndoOutcome> {
    return this.step('undo');
  }

  async redo(): Promise<UndoOutcome> {
    return this.step('redo');
  }

  private async step(direction: 'undo' | 'redo'): Promise<UndoOutcome> {
    const from = direction === 'undo' ? this.undoStack : this.redoStack;
    const to = direction === 'undo' ? this.redoStack : this.undoStack;
    const group = from.pop();
    if (!group) return { status: 'empty' };
    const refusal = await this.applyGroup(group, direction);
    if (refusal) {
      if (refusal.keep) from.push(group);
      this.emitUndoState();
      return { status: 'refused', message: refusal.message };
    }
    to.push(group);
    this.emitUndoState();
    return { status: 'done', label: group.label };
  }

  // ---- internals -----------------------------------------------------------

  /** Checks every step first and writes only when all of them are safe; returns the refusal otherwise. */
  private async applyGroup(group: UndoGroup, direction: 'undo' | 'redo'): Promise<Refusal | null> {
    const at = this.deps.clock();
    const settings = await this.deps.settings.get();
    const verb = direction === 'undo' ? 'deshacer' : 'rehacer';
    const ordered = direction === 'undo' ? [...group.mutations].reverse() : group.mutations;
    const writes: { step: UndoStep; current: EntityValue | null; target: EntityValue | null }[] = [];

    for (const step of ordered) {
      const current = await this.read(step.entity, step.entityId);
      if (!sameData(current, step.applied)) {
        return { message: `No se pudo ${verb}: ${this.describe(step, current)} cambió en otra pestaña después de ese paso. Revisá el Historial; el valor actual no se tocó.`, keep: false };
      }
      const wanted = direction === 'undo' ? step.before : step.after;
      let target: EntityValue | null = wanted;
      if (step.entity === 'order') {
        const stored = current as Order | null;
        const base = (wanted ?? stored) as Order | null;
        if (base === null || stored === null) continue;
        target = {
          ...base,
          status: wanted === null ? 'cancelled' : base.status,
          version: stored.version + 1,
          updatedAt: at,
        };
        const closed = checkWeekOpen(stored, at, settings.closeTime);
        if (closed) return { message: `No se pudo ${verb}. ${closed.message}`, keep: false };
        const full = await this.checkCapacity(stored, target, settings);
        if (full) return { message: `No se pudo ${verb}. ${full.message}`, keep: true };
      }
      writes.push({ step, current, target });
    }

    for (const { step, current, target } of writes) {
      await this.commit({ entity: step.entity, entityId: step.entityId, before: current, after: target }, direction, at);
      step.applied = target;
    }
    return null;
  }

  private describe(step: Mutation, current: EntityValue | null): string {
    switch (step.entity) {
      case 'order':
        return `el pedido ${(current as Order | null)?.code ?? step.entityId}`;
      case 'recipe':
        return `la receta ${step.entityId}`;
      case 'settings':
        return 'los ajustes';
      case 'menu':
        return `el menú de la semana ${step.entityId}`;
    }
  }

  private async resolveConflict(loaded: Order, edited: Order, stored: Order, at: number): Promise<SaveOrderOutcome> {
    const closeInstant = await this.closeInstantFor(stored.weekId);
    const resolution = resolveOrderConflict({
      base: loaded,
      mine: { order: edited, savedAt: at },
      theirs: { order: stored, savedAt: stored.updatedAt },
      closeInstant,
      now: at,
    });
    const winner: Order =
      resolution.winnerSide === 'theirs' ? stored : { ...resolution.winner, id: stored.id, version: stored.version + 1, updatedAt: at };
    await this.commit(
      { entity: 'order', entityId: stored.id, before: stored, after: winner },
      'conflict',
      at,
      { resolution, mine: edited, theirs: stored },
    );
    return { status: 'conflict', order: winner, resolution };
  }

  private async closeInstantFor(weekId: string): Promise<number> {
    const settings = await this.deps.settings.get();
    return closeInstantForWeek(weekId, settings.closeTime);
  }

  private async commit(
    m: Mutation,
    origin: ChangeOrigin,
    at: number,
    conflict?: { resolution: ConflictResolution; mine: Order; theirs: Order },
  ): Promise<HistoryEvent[]> {
    await this.ensureSnapshot(at);
    await this.persist(m);
    const events = this.buildEvents(m, origin, at, conflict);
    await this.deps.events.append(events);

    const summary: ChangeSummary = {
      ...m,
      user: this.deps.user(),
      atMs: at,
      at: new Date(at).toISOString(),
      origin,
    };
    try {
      for (const listener of this.listeners) await listener(summary);
    } finally {
      // Tell the other tabs only now (even if a listener failed): their reload must see the stale flags the listeners wrote.
      const order = m.after && m.entity === 'order' ? (m.after as Order) : null;
      this.deps.bus.publish({
        type: origin === 'conflict' ? 'conflict' : 'changed',
        entity: m.entity,
        id: m.entityId,
        version: order?.version ?? 0,
        savedAt: at,
        tabId: this.deps.tabId,
      });
    }
    return events;
  }

  private async persist(m: Mutation): Promise<void> {
    switch (m.entity) {
      case 'order':
        if (m.after) await this.deps.orders.put(m.after as Order);
        return;
      case 'recipe':
        if (m.after) await this.deps.recipes.put(m.after as RecipeEntity);
        else await this.deps.recipes.delete(m.entityId);
        return;
      case 'settings':
        if (m.after) await this.deps.settings.put(m.after as Settings);
        return;
      case 'menu':
        if (m.after) await this.deps.menus.put(m.after as WeekMenu);
        else await this.deps.menus.delete(m.entityId);
        return;
    }
  }

  private async read(entity: MutableEntity, id: string): Promise<EntityValue | null> {
    switch (entity) {
      case 'order':
        return (await this.deps.orders.get(id)) ?? null;
      case 'recipe':
        return (await this.deps.recipes.get(id)) ?? null;
      case 'settings':
        return this.deps.settings.get();
      case 'menu':
        return (await this.deps.menus.get(id)) ?? null;
    }
  }

  private buildEvents(
    m: Mutation,
    origin: ChangeOrigin,
    at: number,
    conflict?: { resolution: ConflictResolution; mine: Order; theirs: Order },
  ): HistoryEvent[] {
    const groupId = randomId();
    const user = this.deps.user();
    const iso = new Date(at).toISOString();
    const make = (field: string, oldValue: unknown, newValue: unknown, kind: EventKind, meta?: Record<string, unknown>): HistoryEvent => ({
      id: createEventId(at, () => this.deps.tabId.slice(0, 6)),
      at: iso,
      user,
      entity: m.entity,
      entityId: m.entityId,
      field,
      oldValue,
      newValue,
      kind,
      groupId,
      ...(meta ? { meta } : {}),
    });
    const baseKind: EventKind = origin === 'user' ? 'change' : origin;

    const events: HistoryEvent[] = [];
    if (conflict) {
      const { resolution } = conflict;
      events.push(
        make(CONFLICT_MARKER, conflict.theirs, conflict.mine, 'conflict', {
          winnerSide: resolution.winnerSide,
          reason: resolution.reason,
          canChooseOther: resolution.canChooseOther,
          notice: resolution.notice,
          changedFields: resolution.changedFields,
        }),
      );
    }
    if (m.before === null || m.after === null) {
      const kind: EventKind = origin === 'user' ? (m.before === null ? 'create' : 'change') : baseKind;
      events.push(make(WHOLE_ENTITY, m.before, m.after, kind));
      return events;
    }
    for (const diff of diffFields(m.before, m.after)) {
      const cancelled = m.entity === 'order' && origin === 'user' && diff.field === 'status' && diff.newValue === 'cancelled';
      events.push(make(diff.field, diff.oldValue, diff.newValue, cancelled ? 'cancel' : baseKind));
    }
    return events;
  }

  /** Takes the weekly snapshot (and the baseline the first time) BEFORE the first change of a week. */
  private async ensureSnapshot(at: number): Promise<void> {
    const settings = await this.deps.settings.get();
    const weekId = weekIdForInstant(at, settings.closeTime);
    const id = `week-${weekId}`;
    if (await this.deps.snapshots.get(id)) return;
    const [recipes, menus, lastEventId] = await Promise.all([
      this.deps.recipes.list(),
      this.deps.menus.list(),
      this.deps.events.lastId(),
    ]);
    if ((await this.deps.snapshots.count()) === 0) {
      await this.deps.snapshots.put({ id: 'seed', takenAt: 0, lastEventId: '', recipes, menus, settings });
    }
    await this.deps.snapshots.put({ id, takenAt: at, lastEventId, recipes, menus, settings });
  }

  private record(label: string, mutation: Mutation): void {
    this.undoStack.push({ label, mutations: [{ ...mutation, applied: mutation.after }] });
    if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
    this.redoStack = [];
    this.emitUndoState();
  }

  private emitUndoState(): void {
    const state = this.getUndoState();
    for (const listener of this.undoListeners) listener(state);
  }
}
