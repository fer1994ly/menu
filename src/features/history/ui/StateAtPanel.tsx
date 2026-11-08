import { useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import { formatDecimal, formatMoney } from '@/shared/kernel/numberFormat';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { Stat } from '@/shared/ui/Num';
import { Table, TableScroll, TD, TDN, TH, THN } from '@/shared/ui/Table';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { formatInstant, fromLocalInput, toLocalInput } from '@/shared/ui/format';
import { useWeek } from '@/shared/ui/weekContext';
import type { PlanAtResult } from '../application/StateAtService';

/** «Estado al…»: what the app knew at an instant, and the plan it would have produced. */
export function StateAtPanel() {
  const { stateAt, clock } = useServices();
  const { weekId } = useWeek();
  const [value, setValue] = useState(() => toLocalInput(clock()));
  const [result, setResult] = useState<PlanAtResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (input: string) => {
    const at = fromLocalInput(input);
    if (Number.isNaN(at)) {
      setError('Elegí una fecha y una hora');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await stateAt.planAt(weekId, at));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reconstruir el estado');
    } finally {
      setBusy(false);
    }
  };

  const saturday = () => {
    const input = toLocalInput(closeInstantForWeek(weekId, { hour: 11, minute: 0 }));
    setValue(input);
    void run(input);
  };

  const names = new Map(result?.input.recipes.map((r) => [r.code, r.name] as const));
  return (
    <Card title="Estado al…" data-testid="state-at">
      <p className="mb-3">Reconstruye lo que se sabía en ese momento y las porciones que se habrían cocinado.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <WeekSelect />
        <Field label="Fecha y hora (hora de Monterrey)">
          {(c) => <input {...c} type="datetime-local" className={INPUT_CLASS} value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void run(value)}>
          Ver estado
        </Button>
        <Button disabled={busy} onClick={saturday}>
          Sábado 11:00 de la semana elegida
        </Button>
      </div>
      {error && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}
      {result && (
        <div className="mt-4 flex flex-col gap-3">
          <h3 className="text-lg font-bold">Estado al {formatInstant(result.at)}</h3>
          {result.notice && (
            <Notice data-testid="state-at-notice">
              {result.notice}: se muestra el estado inicial de los datos de ejemplo.
            </Notice>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pedidos" testId="state-at-orders">
              {result.orderCount}
            </Stat>
            <Stat label="Porciones (D)" testId="state-at-d">
              {result.input.totalPortions}
            </Stat>
            <Stat label="Sin gluten (G)" testId="state-at-g">
              {result.input.glutenFreePortions}
            </Stat>
          </div>
          {result.result.status === 'optimal' ? (
            <>
              <TableScroll>
                <Table data-testid="state-at-table">
                  <thead>
                    <tr>
                      <th className={TH}>Receta</th>
                      <th className={THN}>Porciones</th>
                      <th className={TH}>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.portions.map((p) => (
                      <tr key={p.code}>
                        <td className={`${TD} font-semibold`}>{p.code}</td>
                        <td className={`${TDN} font-bold`}>{p.portions}</td>
                        <td className={TD}>{names.get(p.code) ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
              <p className="tabular font-semibold" data-testid="state-at-cost">
                Costo con porciones enteras: {formatMoney(result.result.integerCost)} · kcal promedio {formatDecimal(result.result.avgKcal, 2)} · proteína promedio{' '}
                {formatDecimal(result.result.avgProtein, 2)} g
              </p>
              {result.result.warnings.map((w) => (
                <Notice key={w} tone="warning">
                  {w}
                </Notice>
              ))}
            </>
          ) : (
            <Notice tone="warning">{result.result.message}</Notice>
          )}
        </div>
      )}
    </Card>
  );
}
