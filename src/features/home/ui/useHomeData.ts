import { useEffect, useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import type { PlanRecord } from '@/features/planning/domain/planRecord';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { useLiveData } from '@/shared/ui/liveData';

export interface HomeData {
  ordersCount: number;
  portions: number;
  glutenFreePortions: number;
  quota: number;
  closeInstant: number;
  record: PlanRecord | undefined;
}

/** Container hook: figures of the selected week. */
export function useHomeData(weekId: string) {
  const { repos, plans } = useServices();
  return useLiveData<HomeData>(async () => {
    const [orders, settings, record] = await Promise.all([repos.orders.listByWeek(weekId), repos.settings.get(), plans.getRecord(weekId)]);
    const confirmed = orders.filter((o) => o.status === 'confirmed');
    return {
      ordersCount: confirmed.length,
      portions: confirmed.reduce((sum, o) => sum + o.portions, 0),
      glutenFreePortions: confirmed.filter((o) => o.glutenFree).reduce((sum, o) => sum + o.portions, 0),
      quota: settings.weeklyPortionQuota,
      closeInstant: closeInstantForWeek(weekId, settings.closeTime),
      record,
    };
  }, [weekId]);
}

/** Milliseconds to `closeInstant`, ticking every second. */
export function useCountdown(closeInstant: number | null): number | null {
  const { clock } = useServices();
  const [now, setNow] = useState(() => clock());
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(id);
  }, [clock]);
  return closeInstant === null ? null : Math.max(0, closeInstant - now);
}
