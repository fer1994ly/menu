import type { SettingsRepository } from '@/features/admin/application/ports';
import { validateSettings, type Settings } from '@/features/admin/domain/settings';
import type { OrdersRepository } from '@/features/orders/application/ports';
import { resolveOrderConflict, type ConflictResolution } from '@/features/orders/domain/conflict';
import type { Order } from '@/features/orders/domain/order';
import type { MenusRepository } from '@/features/planning/application/ports';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { RecipesRepository } from '@/features/recipes/application/ports';
import { validateRecipe, type RecipeEntity } from '@/features/recipes/domain/recipe';
import { randomId, type Clock } from '@/shared/kernel/runtime';
import { closeInstantForWeek, weekIdForInstant } from '@/shared/kernel/time';
import type { SyncBus } from '@/shared/infrastructure/syncChannel';
import { diffFields } from '../domain/diff';
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

interface UndoGroup {
  label: string;
  mutations: Mutation[];
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
  | { status: 'conflict'; order: Order; resolution: ConflictResolution };

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
   */
  async saveOrder(loaded: Order, edited: Order): Promise<SaveOrderOutcome> {
    const stored = await this.deps.orders.get(loaded.id);
    if (!stored) throw new Error(`Order ${loaded.id} does not exist`);
    const at = this.deps.clock();

    if (stored.version === loaded.version) {
      const next: Order = { ...edited, id: stored.id, version: stored.version + 1, updatedAt: at };
      const mutation: Mutation = { entity: 'order', entityId: stored.id, before: stored, after: next };
      await this.commit(mutation, 'user', at);
      this.record(
        next.status === 'cancelled' && stored.status !== 'cancelled' ? `Pedido ${next.code} cancelado` : `Pedido ${next.code} modificado`,
        mutation,
      );
      return { status: 'saved', order: next };
    }
    return this.resolveConflict(loaded, edited, stored, at);
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
    const closeInstant = await this.closeInstantFor(stored.weekId);
    if (this.deps.clock() > closeInstant) return null;
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

  /** Applies the inverse of the last action and appends `undo` events. */
  async undo(): Promise<boolean> {
    const group = this.undoStack.pop();
    if (!group) return false;
    await this.applyGroup(group, 'undo');
    this.redoStack.push(group);
    this.emitUndoState();
    return true;
  }

  async redo(): Promise<boolean> {
    const group = this.redoStack.pop();
    if (!group) return false;
    await this.applyGroup(group, 'redo');
    this.undoStack.push(group);
    this.emitUndoState();
    return true;
  }

  // ---- internals -----------------------------------------------------------

  private async applyGroup(group: UndoGroup, direction: 'undo' | 'redo'): Promise<void> {
    const at = this.deps.clock();
    const ordered = direction === 'undo' ? [...group.mutations].reverse() : group.mutations;
    for (const m of ordered) {
      const current = await this.read(m.entity, m.entityId);
      const wanted = direction === 'undo' ? m.before : m.after;
      let target: EntityValue | null = wanted;
      if (m.entity === 'order') {
        const base = (wanted ?? current) as Order | null;
        if (base === null) continue;
        const stored = current as Order | null;
        target = {
          ...base,
          status: wanted === null ? 'cancelled' : base.status,
          version: (stored?.version ?? 0) + 1,
          updatedAt: at,
        };
      }
      await this.commit({ entity: m.entity, entityId: m.entityId, before: current, after: target }, direction, at);
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

    const order = m.after && m.entity === 'order' ? (m.after as Order) : null;
    this.deps.bus.publish({
      type: origin === 'conflict' ? 'conflict' : 'changed',
      entity: m.entity,
      id: m.entityId,
      version: order?.version ?? 0,
      savedAt: at,
      tabId: this.deps.tabId,
    });

    const summary: ChangeSummary = {
      ...m,
      user: this.deps.user(),
      atMs: at,
      at: new Date(at).toISOString(),
      origin,
    };
    for (const listener of this.listeners) await listener(summary);
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
    const weekId = weekIdForInstant(at);
    const id = `week-${weekId}`;
    if (await this.deps.snapshots.get(id)) return;
    const [recipes, menus, settings, lastEventId] = await Promise.all([
      this.deps.recipes.list(),
      this.deps.menus.list(),
      this.deps.settings.get(),
      this.deps.events.lastId(),
    ]);
    if ((await this.deps.snapshots.count()) === 0) {
      await this.deps.snapshots.put({ id: 'seed', takenAt: 0, lastEventId: '', recipes, menus, settings });
    }
    await this.deps.snapshots.put({ id, takenAt: at, lastEventId, recipes, menus, settings });
  }

  private record(label: string, mutation: Mutation): void {
    this.undoStack.push({ label, mutations: [mutation] });
    if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
    this.redoStack = [];
    this.emitUndoState();
  }

  private emitUndoState(): void {
    const state = this.getUndoState();
    for (const listener of this.undoListeners) listener(state);
  }
}
