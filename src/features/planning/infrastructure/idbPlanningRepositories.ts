import { bulkPut, type AppDb } from '@/shared/infrastructure/db';
import type { MenusRepository, PlansRepository } from '../application/ports';
import type { WeekMenu } from '../domain/menu';
import type { PlanRecord } from '../domain/planRecord';

export class IdbMenusRepository implements MenusRepository {
  constructor(private readonly db: AppDb) {}

  get(weekId: string): Promise<WeekMenu | undefined> {
    return this.db.get('menus', weekId);
  }

  list(): Promise<WeekMenu[]> {
    return this.db.getAll('menus');
  }

  async put(menu: WeekMenu): Promise<void> {
    await this.db.put('menus', menu);
  }

  putMany(menus: readonly WeekMenu[]): Promise<void> {
    return bulkPut(this.db, 'menus', menus);
  }

  delete(weekId: string): Promise<void> {
    return this.db.delete('menus', weekId);
  }
}

export class IdbPlansRepository implements PlansRepository {
  constructor(private readonly db: AppDb) {}

  get(weekId: string): Promise<PlanRecord | undefined> {
    return this.db.get('plans', weekId);
  }

  list(): Promise<PlanRecord[]> {
    return this.db.getAll('plans');
  }

  async put(record: PlanRecord): Promise<void> {
    await this.db.put('plans', record);
  }

  putMany(records: readonly PlanRecord[]): Promise<void> {
    return bulkPut(this.db, 'plans', records);
  }
}
