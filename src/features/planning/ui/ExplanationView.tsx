import { Link } from 'react-router-dom';
import { formatDecimal } from '@/shared/kernel/numberFormat';
import { Card } from '@/shared/ui/Card';
import { Notice } from '@/shared/ui/Notice';
import { Table, TableScroll, TD, TDN, TH, THN } from '@/shared/ui/Table';
import type { PlanResult } from '../domain/planProduction';
import type { PhaseTrace, SimplexTrace } from '../domain/simplex';
import { constraintLabel } from './constraintLabels';
import { formatCell, TableauView } from './TableauView';

function ModelSummary({ trace }: { trace: SimplexTrace }) {
  const initial = trace.phases[0]?.initial;
  if (!initial) return null;
  const variables = initial.columns.filter((c) => c.startsWith('x_'));
  return (
    <Card title="Modelo">
      <p className="mb-2">
        Minimizamos el costo. Variables: {variables.length} (porciones a producir de cada receta activa,{' '}
        <span className="tabular">{variables.join(', ')}</span>). Restricciones: {initial.rowLabels.length}.
      </p>
      <TableScroll>
        <Table>
          <thead>
            <tr>
              <th className={TH}>Etiqueta</th>
              <th className={TH}>Restricción</th>
            </tr>
          </thead>
          <tbody>
            {initial.rowLabels.map((label) => (
              <tr key={label}>
                <td className={`${TD} tabular`}>{label}</td>
                <td className={TD}>{constraintLabel(label)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </Card>
  );
}

function Phase({ phase, first }: { phase: PhaseTrace; first: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-heading text-lg font-bold">
        Fase {phase.phase}: {phase.phase === 1 ? 'buscar una solución posible' : 'minimizar el objetivo'} ({phase.pivots.length}{' '}
        {phase.pivots.length === 1 ? 'pivote' : 'pivotes'})
      </h4>
      <div>
        <p className="mb-1 font-semibold">Tabla inicial</p>
        <TableauView tableau={phase.initial} {...(first ? { testId: 'initial-tableau' } : {})} />
      </div>
      {phase.pivots.map((pivot, i) => {
        const before = i === 0 ? phase.initial : (phase.pivots[i - 1]?.tableau ?? phase.initial);
        const element = before.rows[pivot.pivotRow]?.[pivot.pivotColumn] ?? 0;
        return (
          <details key={pivot.iteration} className="rounded border border-navy/20 p-2" data-testid="pivot-step">
            <summary className="cursor-pointer font-semibold">
              Pivote {pivot.iteration}: entra {pivot.entering}, sale {pivot.leaving}, elemento pivote {formatCell(element)}
            </summary>
            <div className="mt-2">
              <TableauView tableau={pivot.tableau} highlight={{ row: pivot.pivotRow, column: pivot.pivotColumn }} />
            </div>
          </details>
        );
      })}
      <div>
        <p className="mb-1 font-semibold">Tabla final</p>
        <TableauView tableau={phase.final} testId="final-tableau" />
      </div>
    </div>
  );
}

function ModelTrace({ title, trace }: { title: string; trace: SimplexTrace }) {
  return (
    <Card title={title}>
      <div className="flex flex-col gap-6">
        {trace.phases.map((phase, i) => (
          <Phase key={phase.phase} phase={phase} first={i === 0} />
        ))}
      </div>
    </Card>
  );
}

/** Presentational: model, simplex pivots of both models and the rounding table. */
export function ExplanationView({ result }: { result: PlanResult }) {
  const traces = result.traces;
  return (
    <div className="flex flex-col gap-4">
      {result.status !== 'optimal' && <Notice tone="warning">{result.message}</Notice>}
      {traces && <ModelSummary trace={traces.costModel} />}
      {traces && <ModelTrace title="Modelo de costo mínimo" trace={traces.costModel} />}
      {traces?.proteinModel && <ModelTrace title="Desempate: máxima proteína al costo óptimo" trace={traces.proteinModel} />}
      {result.status === 'optimal' && (
        <Card title="Redondeo por mayor resto">
          <p className="mb-2">
            Quedan {result.remainder} {result.remainder === 1 ? 'porción' : 'porciones'} por repartir. Se suma 1 porción a las recetas con mayor fracción; si empatan, gana el
            código menor.
          </p>
          <TableScroll>
            <Table data-testid="rounding-table">
              <thead>
                <tr>
                  <th className={TH}>Receta</th>
                  <th className={THN}>Valor continuo</th>
                  <th className={THN}>Parte entera</th>
                  <th className={THN}>Fracción</th>
                  <th className={THN}>Orden</th>
                  <th className={THN}>Extra</th>
                  <th className={THN}>Final</th>
                </tr>
              </thead>
              <tbody>
                {result.rounding.map((row) => (
                  <tr key={row.code} className={row.extra ? 'bg-accent/20' : ''}>
                    <td className={`${TD} font-semibold`}>{row.code}</td>
                    <td className={TDN}>{formatDecimal(row.continuous, 6)}</td>
                    <td className={TDN}>{row.integerPart}</td>
                    <td className={TDN}>{formatDecimal(row.fraction, 6)}</td>
                    <td className={TDN}>{row.rank}</td>
                    <td className={`${TDN} font-bold`}>{row.extra ? '+1' : '—'}</td>
                    <td className={`${TDN} font-bold`}>{row.final}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      )}
      <Link className="inline-flex min-h-11 items-center font-semibold underline" to="/plan">
        Volver al plan
      </Link>
    </div>
  );
}
