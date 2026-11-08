import { generateSeed } from '@/features/seed/application/generateSeed';
import { BRIEFING_RECIPES } from '@/features/seed/domain/catalog';
import { runPlanJob } from '../planJob';

const BUDGET_MS = 4000;

describe('performance budget (acceptance 6)', () => {
  it('plans a 600-portion week and recalculates the 52 history weeks in under 4 s', () => {
    // Seed generation is setup, not part of the measured work.
    const seed = generateSeed(Date.UTC(2026, 10, 13, 16, 0, 0));
    const history = seed.plans.map((p) => ({ weekId: p.weekId, input: p.input }));
    expect(history).toHaveLength(52);

    const started = performance.now();
    const week = runPlanJob({
      kind: 'planWeek',
      input: {
        recipes: BRIEFING_RECIPES,
        totalPortions: 600,
        glutenFreePortions: 50,
        chickenCapG: 52_000,
        beefCapG: 40_000,
      },
    });
    const recalculated = runPlanJob({ kind: 'recalculateHistory', inputs: history });
    const elapsedMs = performance.now() - started;

    expect(week.kind === 'planWeek' && week.result.status).toBe('optimal');
    if (recalculated.kind !== 'recalculateHistory') throw new Error('wrong job kind');
    expect(recalculated.results).toHaveLength(52);
    expect(recalculated.results.map((r) => r.outcome.status)).toEqual(seed.plans.map((p) => p.status));
    expect(elapsedMs).toBeLessThan(BUDGET_MS);
    // The job itself reports its own elapsed time too.
    expect(recalculated.elapsedMs).toBeLessThan(BUDGET_MS);
  });
});
