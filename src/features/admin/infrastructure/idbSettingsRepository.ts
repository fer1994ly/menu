import type { AppDb } from '@/shared/infrastructure/db';
import type { SettingsRepository } from '../application/ports';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings';

const KEY = 'main';

export class IdbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: AppDb) {}

  async get(): Promise<Settings> {
    const stored = await this.db.get('settings', KEY);
    return stored ?? DEFAULT_SETTINGS;
  }

  async put(settings: Settings): Promise<void> {
    await this.db.put('settings', settings, KEY);
  }
}
