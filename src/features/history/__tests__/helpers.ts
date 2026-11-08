import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { IdbSettingsRepository } from '@/features/admin/infrastructure/idbSettingsRepository';
import type { Order } from '@/features/orders/domain/order';
import { IdbOrdersRepository } from '@/features/orders/infrastructure/idbOrdersRepository';
import { IdbMenusRepository } from '@/features/planning/infrastructure/idbPlanningRepositories';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import { IdbRecipesRepository } from '@/features/recipes/infrastructure/idbRecipesRepository';
import { TEST_RECIPES } from '@/features/planning/domain/__tests__/fixtures';
import { openAppDb, type AppDb } from '@/shared/infrastructure/db';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { ChangeService } from '../application/ChangeService';
import { IdbEventStore } from '../infrastructure/idbEventStore';
import { IdbSnapshotStore } from '../infrastructure/idbSnapshotStore';

let dbCounter = 0;
export const uniqueDbName = (): string => {
  dbCounter += 1;
  return `test-db-${dbCounter}-${Math.random().toString(36).slice(2, 8)}`;
};

export interface TestTab {
  db: AppDb;
  orders: IdbOrdersRepository;
  recipes: IdbRecipesRepository;
  menus: IdbMenusRepository;
  settings: IdbSettingsRepository;
  events: IdbEventStore;
  snapshots: IdbSnapshotStore;
  changes: ChangeService;
  clock: { now: number };
}

/** One browser tab: its own connection and clock, optionally sharing a DB name and a sync hub. */
export async function createTestTab(options: {
  dbName: string;
  hub?: InMemorySyncHub;
  now?: number;
  user?: string;
  tabId?: string;
}): Promise<TestTab> {
  const db = await openAppDb(options.dbName);
  const clock = { now: options.now ?? Date.UTC(2026, 10, 10, 15, 0, 0) };
  const orders = new IdbOrdersRepository(db);
  const recipes = new IdbRecipesRepository(db);
  const menus = new IdbMenusRepository(db);
  const settings = new IdbSettingsRepository(db);
  const events = new IdbEventStore(db);
  const snapshots = new IdbSnapshotStore(db);
  const hub = options.hub ?? new InMemorySyncHub();
  const changes = new ChangeService({
    orders,
    recipes,
    menus,
    settings,
    events,
    snapshots,
    bus: hub.connect(),
    clock: () => clock.now,
    user: () => options.user ?? 'Ana',
    tabId: options.tabId ?? 'tab-a',
  });
  return { db, orders, recipes, menus, settings, events, snapshots, changes, clock };
}

export function sampleRecipes(): RecipeEntity[] {
  return TEST_RECIPES.map((recipe) => ({ ...recipe, active: true }));
}

export async function seedBasics(tab: TestTab): Promise<void> {
  await tab.recipes.putMany(sampleRecipes());
  await tab.settings.put(DEFAULT_SETTINGS);
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    code: 'P-000001',
    clientId: 'c-1',
    clientName: 'Ana López',
    plan: 5,
    portions: 5,
    glutenFree: false,
    route: 'open',
    weekId: '2026-11-15',
    status: 'confirmed',
    routeChargeCents: 0,
    createdAt: Date.UTC(2026, 10, 9, 15, 0, 0),
    updatedAt: Date.UTC(2026, 10, 9, 15, 0, 0),
    version: 1,
    ...overrides,
  };
}
