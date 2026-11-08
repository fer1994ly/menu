import { clearAllStores, type AppDb } from '@/shared/infrastructure/db';
import { generateSeed, SEED_VERSION } from '../application/generateSeed';

export interface SeedReport {
  seeded: boolean;
  /** Milliseconds spent generating + writing; 0 when nothing was seeded. */
  elapsedMs: number;
  currentWeekId: string | null;
}

const SEED_KEY = 'seedVersion';
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Writes the sample data once (first open). Everything goes in a single transaction. */
export async function seedDatabase(db: AppDb, now: number): Promise<SeedReport> {
  if ((await db.get('meta', SEED_KEY)) !== undefined) return { seeded: false, elapsedMs: 0, currentWeekId: null };
  const started = nowMs();
  const data = generateSeed(now);

  const tx = db.transaction(['clients', 'recipes', 'menus', 'orders', 'plans', 'settings', 'snapshots', 'meta'], 'readwrite');
  const writes: Promise<unknown>[] = [];
  for (const client of data.clients) writes.push(tx.objectStore('clients').put(client));
  for (const recipe of data.recipes) writes.push(tx.objectStore('recipes').put(recipe));
  for (const menu of data.menus) writes.push(tx.objectStore('menus').put(menu));
  for (const order of data.orders) writes.push(tx.objectStore('orders').put(order));
  for (const plan of data.plans) writes.push(tx.objectStore('plans').put(plan));
  writes.push(tx.objectStore('settings').put(data.settings, 'main'));
  // Baseline of «estado al…»: the initial seed state, before any event.
  writes.push(
    tx
      .objectStore('snapshots')
      .put({ id: 'seed', takenAt: 0, lastEventId: '', recipes: data.recipes, menus: data.menus, settings: data.settings }),
  );
  writes.push(tx.objectStore('meta').put(SEED_VERSION, SEED_KEY));
  await Promise.all([...writes, tx.done]);
  return { seeded: true, elapsedMs: nowMs() - started, currentWeekId: data.currentWeekId };
}

/** «Restaurar datos de ejemplo»: wipes every store (history included) and regenerates the seed. */
export async function restoreSampleData(db: AppDb, now: number): Promise<SeedReport> {
  await clearAllStores(db);
  return seedDatabase(db, now);
}
