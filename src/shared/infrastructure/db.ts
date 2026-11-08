import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Client } from '@/features/clients/domain/client';
import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import type { Order } from '@/features/orders/domain/order';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { PlanRecord } from '@/features/planning/domain/planRecord';
import type { Settings } from '@/features/admin/domain/settings';
import type { HistoryEvent } from '@/features/history/domain/event';
import type { StateSnapshot } from '@/features/history/domain/snapshot';

export const DB_NAME = 'privee-food';
export const DB_VERSION = 1;

/** Record types per store. The only place where the feature slices meet the database. */
export interface PriveeDB extends DBSchema {
  clients: { key: string; value: Client };
  recipes: { key: string; value: RecipeEntity };
  /** Key: weekId. */
  menus: { key: string; value: WeekMenu };
  orders: {
    key: string;
    value: Order;
    indexes: { weekId: string; clientId: string; code: string; createdAt: number };
  };
  /** Key: weekId. Last plan summary of the week. */
  plans: { key: string; value: PlanRecord };
  /** Out-of-line key `main`. */
  settings: { key: string; value: Settings };
  events: { key: string; value: HistoryEvent; indexes: { entityId: string; entity: string; user: string } };
  snapshots: { key: string; value: StateSnapshot; indexes: { takenAt: number } };
  /** Out-of-line keys: `seedVersion`, `orderCounter`. */
  meta: { key: string; value: unknown };
}

export type AppDb = IDBPDatabase<PriveeDB>;

export const STORE_NAMES = [
  'clients',
  'recipes',
  'menus',
  'orders',
  'plans',
  'settings',
  'events',
  'snapshots',
  'meta',
] as const;

export function openAppDb(name: string = DB_NAME): Promise<AppDb> {
  return openDB<PriveeDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('clients', { keyPath: 'id' });
      db.createObjectStore('recipes', { keyPath: 'code' });
      db.createObjectStore('menus', { keyPath: 'weekId' });
      const orders = db.createObjectStore('orders', { keyPath: 'id' });
      orders.createIndex('weekId', 'weekId');
      orders.createIndex('clientId', 'clientId');
      orders.createIndex('code', 'code');
      orders.createIndex('createdAt', 'createdAt');
      db.createObjectStore('plans', { keyPath: 'weekId' });
      db.createObjectStore('settings');
      const events = db.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('entityId', 'entityId');
      events.createIndex('entity', 'entity');
      events.createIndex('user', 'user');
      const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
      snapshots.createIndex('takenAt', 'takenAt');
      db.createObjectStore('meta');
    },
  });
}

const PROBE_DB_NAME = 'privee-food-probe';

/**
 * False when IndexedDB is missing or blocked (some private modes, disabled
 * storage). The UI shows a blocking notice in that case.
 */
export async function isIndexedDbAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const db = await openDB(PROBE_DB_NAME, 1, {
      upgrade(upgradeDb) {
        upgradeDb.createObjectStore('probe');
      },
    });
    await db.put('probe', 1, 'ok');
    db.close();
    await deleteDB(PROBE_DB_NAME);
    return true;
  } catch {
    return false;
  }
}

/** Deletes the whole database. Every open connection must be closed first. */
export function deleteAppDb(name: string = DB_NAME): Promise<void> {
  return deleteDB(name);
}

/** Empties every store in one transaction (used by «Restaurar datos de ejemplo»). */
export async function clearAllStores(db: AppDb): Promise<void> {
  const tx = db.transaction([...STORE_NAMES], 'readwrite');
  await Promise.all([...STORE_NAMES.map((store) => tx.objectStore(store).clear()), tx.done]);
}

/** Writes many records of one store inside a single transaction. */
export async function bulkPut<S extends 'clients' | 'recipes' | 'menus' | 'orders' | 'plans'>(
  db: AppDb,
  store: S,
  values: readonly PriveeDB[S]['value'][],
): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  const target = tx.objectStore(store);
  await Promise.all([...values.map((value) => target.put(value as never)), tx.done]);
}
