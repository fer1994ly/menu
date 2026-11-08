import { IdbSettingsRepository } from '@/features/admin/infrastructure/idbSettingsRepository';
import type { SettingsRepository } from '@/features/admin/application/ports';
import type { ClientsRepository } from '@/features/clients/application/ports';
import { IdbClientsRepository } from '@/features/clients/infrastructure/idbClientsRepository';
import { ChangeService } from '@/features/history/application/ChangeService';
import type { EventStore, SnapshotStore } from '@/features/history/application/ports';
import { StateAtService } from '@/features/history/application/StateAtService';
import { IdbEventStore } from '@/features/history/infrastructure/idbEventStore';
import { IdbSnapshotStore } from '@/features/history/infrastructure/idbSnapshotStore';
import { OrderService } from '@/features/orders/application/OrderService';
import type { OrdersRepository } from '@/features/orders/application/ports';
import { IdbOrdersRepository } from '@/features/orders/infrastructure/idbOrdersRepository';
import { PlanService } from '@/features/planning/application/PlanService';
import type { MenusRepository, PlanRunner, PlansRepository } from '@/features/planning/application/ports';
import { IdbMenusRepository, IdbPlansRepository } from '@/features/planning/infrastructure/idbPlanningRepositories';
import { createPlanRunner } from '@/features/planning/infrastructure/planWorkerClient';
import type { RecipesRepository } from '@/features/recipes/application/ports';
import { IdbRecipesRepository } from '@/features/recipes/infrastructure/idbRecipesRepository';
import { restoreSampleData, seedDatabase, type SeedReport } from '@/features/seed/infrastructure/seedDatabase';
import { DB_NAME, isIndexedDbAvailable, openAppDb, type AppDb } from '@/shared/infrastructure/db';
import { createSyncBus, type SyncBus } from '@/shared/infrastructure/syncChannel';
import { randomId, systemClock, type Clock } from '@/shared/kernel/runtime';
import { createSessionUser, type SessionUser } from './sessionUser';

export const INDEXEDDB_UNAVAILABLE_MESSAGE =
  'Tu navegador no permite guardar datos en este dispositivo (¿ventana privada o almacenamiento bloqueado?). Abrí la app en una ventana normal para poder usarla.';

export interface Repositories {
  orders: OrdersRepository;
  clients: ClientsRepository;
  recipes: RecipesRepository;
  menus: MenusRepository;
  plans: PlansRepository;
  settings: SettingsRepository;
  events: EventStore;
  snapshots: SnapshotStore;
}

/** Everything the UI consumes (through `useServices()`). */
export interface AppServices {
  tabId: string;
  clock: Clock;
  session: SessionUser;
  repos: Repositories;
  /** THE way to mutate orders, recipes, settings and menus; also undo / redo. */
  changes: ChangeService;
  /** Creates orders applying close, quota and route rules. */
  orders: OrderService;
  /** Calculates, persists, explains and recalculates plans; flags stale ones. */
  plans: PlanService;
  /** «Estado al…» reconstruction and `planAt`. */
  stateAt: StateAtService;
  /** Cross-tab messages from OTHER tabs (subscribe to refresh screens). */
  bus: SyncBus;
  /** What the seed did on this open (`seeded: false` when data already existed). */
  seedReport: SeedReport;
  /** «Restaurar datos de ejemplo»: wipes IndexedDB content and regenerates the seed. */
  restoreSampleData(): Promise<SeedReport>;
  dispose(): void;
}

export interface AppServicesOptions {
  dbName?: string;
  clock?: Clock;
  runner?: PlanRunner;
  bus?: SyncBus;
  session?: SessionUser;
  tabId?: string;
  /** Default true: seed the sample data on first open. */
  seed?: boolean;
}

/** Result of opening the app: ready, or IndexedDB is blocked and the UI must show a blocking notice. */
export type IndexedDbGuardResult =
  | { status: 'checking' }
  | { status: 'ready'; services: AppServices }
  | { status: 'unavailable'; message: string };

/** Composition root. Never throws for a blocked IndexedDB: it returns `unavailable`. */
export async function createAppServices(options: AppServicesOptions = {}): Promise<IndexedDbGuardResult> {
  if (!(await isIndexedDbAvailable())) return { status: 'unavailable', message: INDEXEDDB_UNAVAILABLE_MESSAGE };

  let db: AppDb;
  try {
    db = await openAppDb(options.dbName ?? DB_NAME);
  } catch {
    return { status: 'unavailable', message: INDEXEDDB_UNAVAILABLE_MESSAGE };
  }

  const clock = options.clock ?? systemClock;
  const session = options.session ?? createSessionUser();
  const tabId = options.tabId ?? randomId();
  const bus = options.bus ?? createSyncBus();
  const runner = options.runner ?? createPlanRunner();

  const repos: Repositories = {
    orders: new IdbOrdersRepository(db),
    clients: new IdbClientsRepository(db),
    recipes: new IdbRecipesRepository(db),
    menus: new IdbMenusRepository(db),
    plans: new IdbPlansRepository(db),
    settings: new IdbSettingsRepository(db),
    events: new IdbEventStore(db),
    snapshots: new IdbSnapshotStore(db),
  };

  const seedReport = options.seed === false ? { seeded: false, elapsedMs: 0, currentWeekId: null } : await seedDatabase(db, clock());

  const changes = new ChangeService({
    orders: repos.orders,
    recipes: repos.recipes,
    settings: repos.settings,
    menus: repos.menus,
    events: repos.events,
    snapshots: repos.snapshots,
    bus,
    clock,
    user: () => session.get(),
    tabId,
  });
  const plans = new PlanService({
    orders: repos.orders,
    recipes: repos.recipes,
    menus: repos.menus,
    settings: repos.settings,
    plans: repos.plans,
    events: repos.events,
    runner,
    clock,
    user: () => session.get(),
    tabId,
    bus,
  });
  changes.addChangeListener(plans.onChange);
  const orders = new OrderService({ orders: repos.orders, clients: repos.clients, settings: repos.settings, changes, clock });
  const stateAt = new StateAtService({
    orders: repos.orders,
    recipes: repos.recipes,
    menus: repos.menus,
    settings: repos.settings,
    events: repos.events,
    snapshots: repos.snapshots,
    runner,
  });

  // Another tab restored the sample data: this tab's undo history describes data that no longer exists.
  // (The UI reloads on every bus message, so screens refresh by themselves.)
  const offReset = bus.subscribe((message) => {
    if (message.type === 'reset') changes.resetUndo();
  });

  const services: AppServices = {
    tabId,
    clock,
    session,
    repos,
    changes,
    orders,
    plans,
    stateAt,
    bus,
    seedReport,
    async restoreSampleData() {
      const report = await restoreSampleData(db, clock());
      changes.resetUndo();
      bus.publish({ type: 'reset', entity: 'all', id: '*', version: 0, savedAt: clock(), tabId });
      return report;
    },
    dispose() {
      offReset();
      runner.dispose();
      bus.close();
      db.close();
    },
  };
  return { status: 'ready', services };
}
