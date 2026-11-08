import type { RecipeEntity } from '@/features/recipes/domain/recipe';
import type { WeekMenu } from '@/features/planning/domain/menu';
import type { Settings } from '@/features/admin/domain/settings';

/**
 * Copy of the event-managed small state (recipes, menus, settings) taken before
 * the first change of a week. Orders are not copied (26.000+ records): they are
 * rebuilt from the order store plus the events (see StateAtService).
 */
export interface StateSnapshot {
  /** `seed` for the baseline, `week-<weekId>` for weekly snapshots. */
  id: string;
  /** Epoch ms the snapshot reflects. 0 for the baseline. */
  takenAt: number;
  /** Id of the last event already included ('' when none). */
  lastEventId: string;
  recipes: RecipeEntity[];
  menus: WeekMenu[];
  settings: Settings;
}
