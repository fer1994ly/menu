import { uniqueDbName } from '@/features/history/__tests__/helpers';
import { TEST_RECIPES } from '@/features/planning/domain/__tests__/fixtures';
import { InlinePlanRunner } from '@/features/planning/infrastructure/planWorkerClient';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { createAppServices, type AppServices } from '../container';

async function tab(dbName: string, hub: InMemorySyncHub, tabId: string): Promise<AppServices> {
  const result = await createAppServices({
    dbName,
    seed: false,
    clock: () => Date.UTC(2026, 10, 13, 16, 0, 0),
    runner: new InlinePlanRunner(),
    bus: hub.connect(),
    tabId,
  });
  if (result.status !== 'ready') throw new Error('services not ready');
  return result.services;
}

describe('restoring the sample data from another tab', () => {
  it('clears the undo stack of the tabs that did not restore', async () => {
    const dbName = uniqueDbName();
    const hub = new InMemorySyncHub();
    const a = await tab(dbName, hub, 'tab-a');
    const b = await tab(dbName, hub, 'tab-b');
    await b.changes.saveRecipe({ ...TEST_RECIPES[0]!, active: true });
    await b.changes.saveRecipe({ ...TEST_RECIPES[0]!, active: true, cost: 70 });
    expect(b.changes.getUndoState().canUndo).toBe(true);

    a.bus.publish({ type: 'reset', entity: 'all', id: '*', version: 0, savedAt: 1, tabId: 'tab-a' });

    expect(b.changes.getUndoState()).toMatchObject({ canUndo: false, canRedo: false });
    a.dispose();
    b.dispose();
  });
});
