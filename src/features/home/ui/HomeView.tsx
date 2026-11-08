import { Link } from 'react-router-dom';
import type { CalculateOutcome } from '@/features/planning/application/PlanService';
import type { PlanStatusLabel } from '@/features/planning/ui/planStatus';
import { formatDecimal, formatMoney } from '@/shared/kernel/numberFormat';
import { Badge, Spinner, UsageBar } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Notice } from '@/shared/ui/Notice';
import { Stat } from '@/shared/ui/Num';
import { formatCountdown, formatWeekLabel } from '@/shared/ui/format';
import type { HomeData } from './useHomeData';

export interface HomeViewProps {
  weekId: string;
  isCurrentWeek: boolean;
  data: HomeData;
  status: PlanStatusLabel;
  /** Milliseconds to the close; 0 means closed. */
  countdownMs: number;
  busy: boolean;
  outcome: CalculateOutcome | null;
  error: string | null;
  onCalculate(): void;
}

const STATUS_TONE = { 'sin calcular': 'neutral', calculado: 'ok', desactualizado: 'accent', 'sin solución': 'warning' } as const;

function PlanSummary({ outcome }: { outcome: CalculateOutcome }) {
  if (!outcome.ok) {
    return (
      <Notice tone="warning" title="No se pudo calcular la producción" data-testid="plan-failure">
        <p>{outcome.failure.message}</p>
        {outcome.kept && <p className="mt-1">Se conserva el plan anterior de esta semana.</p>}
      </Notice>
    );
  }
  const { result } = outcome;
  return (
    <Card title="Plan calculado" data-testid="plan-summary">
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Costo (porciones enteras)">{formatMoney(result.integerCost)}</Stat>
        <Stat label="Tiempo de cálculo">{`${formatDecimal(outcome.elapsedMs, 0)} ms`}</Stat>
      </dl>
      {result.warnings.length > 0 && (
        <p className="mt-3 font-semibold text-error">
          {result.warnings.length === 1 ? 'Hay 1 advertencia en el plan.' : `Hay ${result.warnings.length} advertencias en el plan.`}
        </p>
      )}
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold underline" to="/plan">
        Ver el plan
      </Link>
    </Card>
  );
}

/** Presentational: current week dashboard. */
export function HomeView({ weekId, isCurrentWeek, data, status, countdownMs, busy, outcome, error, onCalculate }: HomeViewProps) {
  const closed = countdownMs <= 0;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold">
          {isCurrentWeek ? 'Semana de entrega: ' : 'Semana: '}
          {formatWeekLabel(weekId)}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Plan: <Badge tone={STATUS_TONE[status]} data-testid="plan-status">{status}</Badge>
          </span>
          <span>
            Cierre del sábado:{' '}
            <strong className="tabular" data-testid="countdown">
              {closed ? 'Cerrado' : formatCountdown(countdownMs)}
            </strong>
          </span>
        </p>
      </div>

      <Button variant="primary" className="min-h-14 w-full text-xl" data-testid="calculate-button" disabled={busy} onClick={onCalculate}>
        {busy ? <Spinner label="Calculando…" /> : 'Calcular producción'}
      </Button>

      {error && <Notice tone="error">{error}</Notice>}
      {outcome && <PlanSummary outcome={outcome} />}

      {data.ordersCount === 0 ? (
        <EmptyState message="Todavía no hay pedidos para esta semana">
          <Link className="inline-flex min-h-11 items-center rounded border-2 border-navy px-4 font-semibold" to="/pedidos">
            Cargar un pedido
          </Link>
        </EmptyState>
      ) : null}

      <Card title="Pedidos de la semana">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Pedidos recibidos" testId="orders-count">
            {data.ordersCount}
          </Stat>
          <Stat label="Porciones totales" testId="total-portions">
            {data.portions}
          </Stat>
          <Stat label="Porciones sin gluten" testId="gluten-free-portions">
            {data.glutenFreePortions}
          </Stat>
          <Stat label="Cupo semanal usado" testId="quota-used">
            {`${data.portions}/${data.quota}`}
          </Stat>
        </div>
        <div className="mt-3">
          <UsageBar used={data.portions} cap={data.quota} label="Cupo semanal usado" />
        </div>
      </Card>
    </div>
  );
}
