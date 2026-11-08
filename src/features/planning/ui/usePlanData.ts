import { useServices } from '@/app/AppServicesProvider';
import { useLiveData } from '@/shared/ui/liveData';
import type { PlanResult } from '../domain/planProduction';
import type { PlanRecord } from '../domain/planRecord';

/** Stored plan of the week (without simplex traces). */
export function usePlanRecord(weekId: string) {
  const { plans } = useServices();
  return useLiveData<{ record: PlanRecord | null }>(async () => ({ record: (await plans.getRecord(weekId)) ?? null }), [weekId]);
}

/** Full result with the simplex traces, for the explanation screen. */
export function usePlanExplanation(weekId: string) {
  const { plans } = useServices();
  return useLiveData<{ result: PlanResult | null }>(async () => ({ result: await plans.explain(weekId) }), [weekId]);
}
