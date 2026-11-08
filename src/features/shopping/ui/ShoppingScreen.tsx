import { Link } from 'react-router-dom';
import { useServices } from '@/app/AppServicesProvider';
import type { Settings } from '@/features/admin/domain/settings';
import type { PlanRecord } from '@/features/planning/domain/planRecord';
import { formatGrams, formatMoney } from '@/shared/kernel/numberFormat';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Notice } from '@/shared/ui/Notice';
import { Table, TableScroll, TD, TDN, TH, THN } from '@/shared/ui/Table';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { downloadText } from '@/shared/ui/download';
import { useLiveData } from '@/shared/ui/liveData';
import { useWeek } from '@/shared/ui/weekContext';
import { buildShoppingCsv, CSV_BOM } from '../domain/shoppingCsv';
import { buildShoppingList, type ShoppingList } from '../domain/shoppingList';

export const NO_SHOPPING_LIST_MESSAGE = 'No hay lista de compras porque no hay plan de producción posible.';

function listFor(record: PlanRecord, settings: Settings): ShoppingList | null {
  if (record.outcome.status !== 'optimal') return null;
  const portions = Object.fromEntries(record.outcome.integer.map((p) => [p.code, p.portions]));
  return buildShoppingList(record.input.recipes, portions, {
    chicken: { packageSizeG: settings.chickenPackage.sizeG, priceCents: settings.chickenPackage.priceCents },
    beef: { packageSizeG: settings.beefPackage.sizeG, priceCents: settings.beefPackage.priceCents },
  });
}

/** Presentational: shopping table of one week. */
export function ShoppingTable({ list }: { list: ShoppingList }) {
  const rows = [
    { name: 'Pollo', line: list.chicken },
    { name: 'Res', line: list.beef },
  ];
  return (
    <TableScroll>
      <Table data-testid="shopping-table">
        <thead>
          <tr>
            <th className={TH}>Insumo</th>
            <th className={THN}>Gramos</th>
            <th className={THN}>Paquete</th>
            <th className={THN}>Paquetes</th>
            <th className={THN}>Costo</th>
            <th className={THN}>Sobrante</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, line }) => (
            <tr key={name}>
              <td className={`${TD} font-semibold`}>{name}</td>
              <td className={TDN}>{formatGrams(line.grams)}</td>
              <td className={TDN}>{formatGrams(line.packageSizeG)}</td>
              <td className={`${TDN} font-bold`}>{line.packages}</td>
              <td className={TDN}>{formatMoney(line.costCents / 100)}</td>
              <td className={TDN}>{formatGrams(line.leftoverGrams)}</td>
            </tr>
          ))}
          <tr className="bg-neutral font-bold">
            <td className={TD}>Total</td>
            <td className={TDN} />
            <td className={TDN} />
            <td className={TDN}>{list.chicken.packages + list.beef.packages}</td>
            <td className={`${TDN} font-heading text-lg`} data-testid="shopping-total">
              {formatMoney(list.totalCostCents / 100)}
            </td>
            <td className={TDN} />
          </tr>
        </tbody>
      </Table>
    </TableScroll>
  );
}

export function ShoppingScreen() {
  const { weekId } = useWeek();
  const { plans, repos } = useServices();
  const { data, error } = useLiveData(async () => {
    const [record, settings] = await Promise.all([plans.getRecord(weekId), repos.settings.get()]);
    return { record: record ?? null, list: record ? listFor(record, settings) : null };
  }, [weekId]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Lista de compras</h2>
      <WeekSelect className="max-w-xs" />
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.record && (
        <EmptyState message="Todavía no hay un plan calculado para esta semana">
          <Link className="inline-flex min-h-11 items-center rounded border-2 border-accent bg-accent px-4 font-semibold" to="/plan">
            Ir al plan
          </Link>
        </EmptyState>
      )}
      {data?.record && !data.list && <Notice tone="warning">{NO_SHOPPING_LIST_MESSAGE}</Notice>}
      {data?.record && data.list && (
        <Card
          title="Qué comprar"
          actions={
            <Button variant="primary" onClick={() => downloadText(`compras-${weekId}.csv`, CSV_BOM + buildShoppingCsv(weekId, data.list as ShoppingList))}>
              Exportar CSV
            </Button>
          }
        >
          {data.record.stale && <Notice className="mb-3">Este plan está desactualizado: la lista puede cambiar al recalcular.</Notice>}
          <ShoppingTable list={data.list} />
        </Card>
      )}
    </div>
  );
}
