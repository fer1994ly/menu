import { openAppDb, type AppDb } from '@/shared/infrastructure/db';
import { uniqueDbName } from '@/features/history/__tests__/helpers';
import { IdbPlansRepository } from '@/features/planning/infrastructure/idbPlanningRepositories';
import { restoreSampleData, seedDatabase } from '../seedDatabase';

const NOW = Date.UTC(2026, 10, 13, 16, 0, 0);

describe('seedDatabase', () => {
  let db: AppDb;
  let report: Awaited<ReturnType<typeof seedDatabase>>;

  beforeAll(async () => {
    db = await openAppDb(uniqueDbName());
    report = await seedDatabase(db, NOW);
  }, 120_000);

  it('writes 2.000 clients, 66 recipes, 26.050 orders, 53 menus and 52 plans', async () => {
    expect(report.seeded).toBe(true);
    expect(await db.count('clients')).toBe(2000);
    expect(await db.count('recipes')).toBe(66);
    expect(await db.count('orders')).toBe(26_050);
    expect(await db.count('menus')).toBe(53);
    expect(await db.count('plans')).toBe(52);
    expect(await db.get('settings', 'main')).toMatchObject({ chickenCapG: 26_000 });
    expect(await db.get('snapshots', 'seed')).toMatchObject({ takenAt: 0 });
    expect(await db.count('events')).toBe(0);
  });

  it('seeds in a bounded time (bulk transactions)', () => {
    expect(report.elapsedMs).toBeLessThan(30_000);
  });

  it('does nothing the second time', async () => {
    expect(await seedDatabase(db, NOW)).toMatchObject({ seeded: false });
  });

  it('indexes orders by week and finds the briefing scenario', async () => {
    const week = await db.getAllFromIndex('orders', 'weekId', report.currentWeekId as string);
    expect(week).toHaveLength(50);
  });

  it('restoreSampleData wipes everything and regenerates the same data', async () => {
    await db.put('plans', { ...(await new IdbPlansRepository(db).list())[0]!, stale: true });
    await db.put('meta', 'junk', 'extra');
    const restored = await restoreSampleData(db, NOW);
    expect(restored.seeded).toBe(true);
    expect(await db.count('orders')).toBe(26_050);
    expect(await db.get('meta', 'extra')).toBeUndefined();
    expect((await new IdbPlansRepository(db).list()).some((p) => p.stale)).toBe(false);
  }, 120_000);
});
