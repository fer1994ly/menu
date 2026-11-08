import { planStatusLabel } from '@/features/planning/ui/planStatus';
import { useCalculatePlan } from '@/features/planning/ui/useCalculatePlan';
import { Notice } from '@/shared/ui/Notice';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { useWeek } from '@/shared/ui/weekContext';
import { HomeView } from './HomeView';
import { useCountdown, useHomeData } from './useHomeData';

/** Container: wires the week, the stored figures and the calculation to the view. */
export function HomeScreen() {
  const { weekId, currentWeekId } = useWeek();
  const { data, error: loadError } = useHomeData(weekId);
  const calc = useCalculatePlan(weekId);
  const countdown = useCountdown(data?.closeInstant ?? null);

  return (
    <div className="flex flex-col gap-4">
      <WeekSelect className="max-w-xs" />
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {data && countdown !== null && (
        <HomeView
          weekId={weekId}
          isCurrentWeek={weekId === currentWeekId}
          data={data}
          status={planStatusLabel(data.record)}
          countdownMs={countdown}
          busy={calc.busy}
          outcome={calc.outcome}
          error={calc.error}
          onCalculate={() => void calc.calculate()}
        />
      )}
    </div>
  );
}
