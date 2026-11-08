import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices } from '@/app/AppServicesProvider';
import { formatDecimal } from '@/shared/kernel/numberFormat';
import { Spinner } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Notice } from '@/shared/ui/Notice';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { useReload } from '@/shared/ui/liveData';
import { useWeek } from '@/shared/ui/weekContext';
import { PlanView } from './PlanView';
import { useCalculatePlan } from './useCalculatePlan';
import { usePlanRecord } from './usePlanData';

/** «Recalcular las 52 semanas»: runs in the worker, so the spinner keeps animating. */
function RecalculateHistory() {
  const { plans } = useServices();
  const reload = useReload();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const { records, elapsedMs } = await plans.recalculateHistory();
      const n = records.length;
      setResult(`${n === 1 ? '1 semana recalculada' : `${n} semanas recalculadas`} en ${formatDecimal(elapsedMs, 0)} ms`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recalcular el historial');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void run()} disabled={busy}>
        Recalcular las 52 semanas
      </Button>
      {busy && (
        <p>
          <Spinner label="Recalculando en segundo plano… la pantalla sigue respondiendo." />
        </p>
      )}
      {result && (
        <p className="font-semibold" data-testid="recalc-result" role="status">
          {result}
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function PlanScreen() {
  const { weekId } = useWeek();
  const { data, error } = usePlanRecord(weekId);
  const calc = useCalculatePlan(weekId);
  const failure = calc.outcome && !calc.outcome.ok ? calc.outcome.failure.message : null;
  const elapsed = calc.outcome?.elapsedMs ?? null;
  const record = data?.record ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Plan de producción</h2>
      <div className="flex flex-wrap items-end gap-3">
        <WeekSelect className="w-full max-w-xs" />
        <Button variant="primary" disabled={calc.busy} data-testid="calculate-button" onClick={() => void calc.calculate()}>
          {calc.busy ? <Spinner label="Calculando…" /> : 'Calcular producción'}
        </Button>
        {record?.outcome.status === 'optimal' && (
          <>
            <Link className="inline-flex min-h-11 items-center font-semibold underline" to="/plan/explicacion">
              Cómo se calculó
            </Link>
            <Link className="inline-flex min-h-11 items-center font-semibold underline" to="/compras">
              Lista de compras
            </Link>
          </>
        )}
      </div>
      {(error || calc.error) && <Notice tone="error">{error ?? calc.error}</Notice>}
      {data && !record && !failure && <EmptyState message="Todavía no hay un plan calculado para esta semana" />}
      {record && <PlanView record={record} failureMessage={failure} elapsedMs={elapsed} />}
      {data && !record && failure && (
        <Notice tone="warning" title="No se pudo calcular la producción" data-testid="plan-failure">
          {failure}
        </Notice>
      )}
      <RecalculateHistory />
    </div>
  );
}
