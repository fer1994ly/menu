import type { Settings } from '../domain/settings';

export interface SettingsRepository {
  /** Stored settings, or the defaults when nothing was saved yet. */
  get(): Promise<Settings>;
  put(settings: Settings): Promise<void>;
}
