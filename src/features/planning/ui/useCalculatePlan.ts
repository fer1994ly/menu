import { useCallback, useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import { useReload } from '@/shared/ui/liveData';
import type { CalculateOutcome } from '../application/PlanService';

export interface CalculatePlanState {
  busy: boolean;
  outcome: CalculateOutcome | null;
  error: string | null;
  calculate(): Promise<void>;
}

/** Container hook: runs the plan in the worker and refreshes the screens afterwards. */
export function useCalculatePlan(weekId: string): CalculatePlanState {
  const { plans } = useServices();
  const reload = useReload();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ weekId: string; value: CalculateOutcome } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const value = await plans.calculate(weekId);
      setOutcome({ weekId, value });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular la producción');
    } finally {
      setBusy(false);
    }
  }, [plans, weekId, reload]);

  return { busy, outcome: outcome?.weekId === weekId ? outcome.value : null, error, calculate };
}
