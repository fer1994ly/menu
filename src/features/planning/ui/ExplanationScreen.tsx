import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Notice } from '@/shared/ui/Notice';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { useWeek } from '@/shared/ui/weekContext';
import { ExplanationView } from './ExplanationView';
import { usePlanExplanation } from './usePlanData';

export function ExplanationScreen() {
  const { weekId } = useWeek();
  const { data, error } = usePlanExplanation(weekId);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Cómo se calculó</h2>
      <WeekSelect className="max-w-xs" />
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.result && (
        <EmptyState message="Todavía no hay un plan calculado para esta semana">
          <Link className="inline-flex min-h-11 items-center rounded border-2 border-accent bg-accent px-4 font-semibold" to="/plan">
            Ir al plan
          </Link>
        </EmptyState>
      )}
      {data?.result && <ExplanationView result={data.result} />}
    </div>
  );
}
