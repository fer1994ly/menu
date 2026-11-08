import type { ReactNode } from 'react';
import { formatDecimal, formatGrams, formatMoney } from '@/shared/kernel/numberFormat';
import { Badge, UsageBar } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { Notice } from '@/shared/ui/Notice';
import { Stat } from '@/shared/ui/Num';
import { Table, TableScroll, TD, TDN, TH, THN } from '@/shared/ui/Table';
import type { PlanOutcome, PlanRecord } from '../domain/planRecord';

type Success = Extract<PlanOutcome, { status: 'optimal' }>;

export interface PlanViewProps {
  record: PlanRecord;
  /** Failure message of the last attempt (the stored record is then the kept plan). */
  failureMessage: string | null;
  elapsedMs: number | null;
}

function SolutionTable({ testId, title, rows }: { testId: string; title: string; rows: { code: string; name: string; value: string }[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-base font-bold">{title}</h3>
      <TableScroll>
        <Table data-testid={testId}>
          <thead>
            <tr>
              <th className={TH}>Receta</th>
              <th className={TH}>Nombre</th>
              <th className={THN}>Porciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td className={`${TD} font-semibold`}>{row.code}</td>
                <td className={TD}>{row.name}</td>
                <td className={`${TDN} font-heading text-lg font-bold`}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </div>
  );
}

function CapRow({ label, used, cap }: { label: string; used: number; cap: number }) {
  const over = used > cap;
  return (
    <div>
      <p className="flex flex-wrap justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className={`tabular ${over ? 'font-bold text-error' : ''}`}>
          {formatGrams(used)} de {formatGrams(cap)}
          {cap > 0 ? ` (${formatDecimal((used / cap) * 100, 1)} %)` : ''}
        </span>
      </p>
      <UsageBar used={used} cap={cap} label={`Uso del ${label.toLowerCase()}`} />
    </div>
  );
}

function PlanBody({ record, outcome, elapsedMs }: { record: PlanRecord; outcome: Success; elapsedMs: number | null }) {
  const names = new Map(record.input.recipes.map((r) => [r.code, r.name] as const));
  const nameOf = (code: string) => names.get(code) ?? '';
  const blocked = record.input.blockedCodes ?? [];
  const activeCodes = new Set(outcome.integer.map((p) => p.code));
  const blockedHere = blocked.filter((code) => names.has(code) && !activeCodes.has(code));
  return (
    <>
      <Card title="Resumen">
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Porciones totales (D)" testId="plan-d">
            {record.input.totalPortions}
          </Stat>
          <Stat label="Sin gluten (G)" testId="plan-g">
            {record.input.glutenFreePortions}
          </Stat>
          <Stat label="Costo continuo" testId="continuous-cost">
            {formatMoney(outcome.continuousCost)}
          </Stat>
          <Stat label="Costo con porciones enteras" testId="integer-cost">
            {formatMoney(outcome.integerCost)}
          </Stat>
          <Stat label="Kcal promedio" testId="avg-kcal">
            {formatDecimal(outcome.avgKcal, 2)}
          </Stat>
          <Stat label="Proteína promedio (g)" testId="avg-protein">
            {formatDecimal(outcome.avgProtein, 2)}
          </Stat>
          <Stat label="Tiempo de cálculo" testId="elapsed-ms">
            {elapsedMs === null ? '— ms' : `${formatDecimal(elapsedMs, 0)} ms`}
          </Stat>
        </div>
        {blockedHere.length > 0 && <p className="mt-3 text-sm">Fuera por rotación: {blockedHere.join(', ')} (se sirvieron la semana anterior).</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SolutionTable
          testId="continuous-table"
          title="Solución continua"
          rows={outcome.continuous.map((p) => ({ code: p.code, name: nameOf(p.code), value: formatDecimal(p.portions, 2) }))}
        />
        <SolutionTable
          testId="integer-table"
          title="Porciones enteras a cocinar"
          rows={outcome.integer.map((p) => ({ code: p.code, name: nameOf(p.code), value: String(p.portions) }))}
        />
      </div>

      <Card title="Uso de los topes">
        <div className="flex flex-col gap-3">
          <CapRow label="Tope de pollo" used={outcome.capUsage.chicken.used} cap={outcome.capUsage.chicken.cap} />
          <CapRow label="Tope de res" used={outcome.capUsage.beef.used} cap={outcome.capUsage.beef.cap} />
        </div>
      </Card>
    </>
  );
}

/** Presentational: warnings first, then the plan. */
export function PlanView({ record, failureMessage, elapsedMs }: PlanViewProps): ReactNode {
  const { outcome } = record;
  return (
    <div className="flex flex-col gap-4">
      {failureMessage && (
        <Notice tone="warning" title="No se pudo calcular la producción" data-testid="plan-failure">
          <p>{failureMessage}</p>
          {outcome.status === 'optimal' && <p className="mt-1">Se conserva el plan anterior de esta semana.</p>}
        </Notice>
      )}
      {outcome.status !== 'optimal' && !failureMessage && (
        <Notice tone="warning" title="Sin plan para esta semana" data-testid="plan-failure">
          <p>{outcome.message}</p>
        </Notice>
      )}
      {outcome.status === 'optimal' && outcome.warnings.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="plan-warnings">
          {outcome.warnings.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}
        </div>
      )}
      {record.stale && (
        <Notice tone="info">
          <Badge tone="accent" data-testid="stale-badge">
            desactualizado
          </Badge>{' '}
          Cambió algo desde el último cálculo (pedidos, recetas, menú o ajustes). Volvé a calcular la producción.
        </Notice>
      )}
      {outcome.status === 'optimal' && <PlanBody record={record} outcome={outcome} elapsedMs={elapsedMs} />}
    </div>
  );
}
