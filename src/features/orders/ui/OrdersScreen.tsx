import { useDeferredValue, useMemo, useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import type { SaveOrderOutcome } from '@/features/history/application/ChangeService';
import { ROUTE_DEFINITIONS, ROUTE_IDS, type RouteId } from '@/features/routes/domain/routes';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { VirtualList } from '@/shared/ui/VirtualList';
import { formatWeekLabel } from '@/shared/ui/format';
import { useLiveData } from '@/shared/ui/liveData';
import { useWeek } from '@/shared/ui/weekContext';
import type { Order } from '../domain/order';
import { NewOrderForm } from './NewOrderForm';
import { OrderEditor, type OrderEdit } from './OrderEditor';
import { OrderRow, ORDER_ROW_HEIGHT } from './OrderRow';
import { filterOrders, type OrderFilters } from './ordersFilter';

interface Feedback {
  tone: 'ok' | 'warning' | 'error';
  text: string;
  conflict?: Extract<SaveOrderOutcome, { status: 'conflict' }>['resolution'];
}

const ALL = 'all';

export function OrdersScreen() {
  const { repos, changes } = useServices();
  const { weekId, weeks } = useWeek();
  const [filters, setFilters] = useState<OrderFilters>({ week: weekId, search: '', plan: '', route: '', glutenFree: '' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const deferredSearch = useDeferredValue(filters.search);

  const set = <K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const { data: all, error } = useLiveData(async () => {
    const orders = filters.week === ALL ? await repos.orders.listAll() : await repos.orders.listByWeek(filters.week);
    const settings = await repos.settings.get();
    return { orders: orders.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)), routeChargeCents: settings.routeChargeCents };
  }, [filters.week]);

  const visible = useMemo(() => (all ? filterOrders(all.orders, { ...filters, search: deferredSearch }) : []), [all, filters, deferredSearch]);
  const portions = useMemo(() => visible.filter((o) => o.status === 'confirmed').reduce((sum, o) => sum + o.portions, 0), [visible]);
  const confirmedCount = useMemo(() => visible.filter((o) => o.status === 'confirmed').length, [visible]);

  const report = (outcome: SaveOrderOutcome, ok: string) => {
    if (outcome.status === 'saved') setFeedback({ tone: 'ok', text: ok });
    else setFeedback({ tone: 'warning', text: outcome.resolution.notice, conflict: outcome.resolution });
  };

  const save = async (edit: OrderEdit) => {
    if (!editing) return;
    setBusy(true);
    try {
      const charge = edit.route === 'open' ? 0 : (all?.routeChargeCents ?? 0);
      const outcome = await changes.saveOrder(editing, { ...editing, ...edit, portions: edit.plan, routeChargeCents: charge });
      report(outcome, `Pedido ${editing.code} guardado.`);
      setEditing(null);
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar el pedido' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (order: Order) => {
    setBusy(true);
    try {
      const outcome = await changes.cancelOrder(order);
      report(outcome, `Pedido ${order.code} cancelado. Los cupos se devolvieron; podés deshacerlo con «Deshacer».`);
    } catch (e) {
      setFeedback({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo cancelar el pedido' });
    } finally {
      setBusy(false);
    }
  };

  const chooseOther = async (resolution: NonNullable<Feedback['conflict']>) => {
    const outcome = await changes.chooseOtherOrderValue(resolution);
    setFeedback(
      outcome
        ? { tone: 'ok', text: `Pedido ${resolution.winner.code}: quedó el otro valor.` }
        : { tone: 'error', text: 'Ya no se puede elegir el otro valor: el cierre ya pasó.' },
    );
  };

  const weekHasNoOrders = all !== null && all.orders.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Pedidos</h2>
        <Button variant="primary" aria-expanded={creating} onClick={() => setCreating((v) => !v)}>
          Nuevo pedido
        </Button>
      </div>

      {creating && <NewOrderForm onClose={() => setCreating(false)} />}

      {feedback && (
        <Notice tone={feedback.tone} data-testid={feedback.conflict ? 'conflict-notice' : 'order-feedback'}>
          <p>{feedback.text}</p>
          {feedback.conflict?.canChooseOther && (
            <Button className="mt-2" onClick={() => void chooseOther(feedback.conflict as NonNullable<Feedback['conflict']>)}>
              Elegir el otro valor
            </Button>
          )}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {editing && <OrderEditor key={editing.id} order={editing} busy={busy} onSave={(edit) => void save(edit)} onClose={() => setEditing(null)} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="Buscar por cliente o código" className="col-span-2">
          {(c) => <input {...c} type="search" className={INPUT_CLASS} value={filters.search} onChange={(e) => set('search', e.target.value)} />}
        </Field>
        <Field label="Semana">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={filters.week} onChange={(e) => set('week', e.target.value)}>
              <option value={ALL}>Todas las semanas</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {formatWeekLabel(w)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Plan">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={filters.plan} onChange={(e) => set('plan', e.target.value as OrderFilters['plan'])}>
              <option value="">Todos</option>
              <option value="5">Plan 5</option>
              <option value="10">Plan 10</option>
            </select>
          )}
        </Field>
        <Field label="Ruta">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={filters.route} onChange={(e) => set('route', e.target.value as '' | RouteId)}>
              <option value="">Todas</option>
              {ROUTE_IDS.map((id) => (
                <option key={id} value={id}>
                  {ROUTE_DEFINITIONS[id].label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Sin gluten">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={filters.glutenFree} onChange={(e) => set('glutenFree', e.target.value as OrderFilters['glutenFree'])}>
              <option value="">Todos</option>
              <option value="yes">Solo sin gluten</option>
              <option value="no">Con gluten</option>
            </select>
          )}
        </Field>
      </div>

      {all && !weekHasNoOrders && (
        <p className="tabular font-semibold" data-testid="orders-total">
          {confirmedCount === 1 ? '1 pedido' : `${confirmedCount} pedidos`} · {portions} porciones
          {visible.length !== confirmedCount ? ` (${visible.length - confirmedCount} cancelados en la lista)` : ''}
        </p>
      )}

      {weekHasNoOrders && <EmptyState message="Todavía no hay pedidos para esta semana" />}
      {all && !weekHasNoOrders && visible.length === 0 && <EmptyState message="Ningún pedido coincide con los filtros" />}
      {visible.length > 0 && (
        <VirtualList
          label="Pedidos"
          testId="orders-table"
          count={visible.length}
          rowHeight={ORDER_ROW_HEIGHT}
          height={560}
          renderRow={(index) => {
            const order = visible[index] as Order;
            return <OrderRow order={order} onEdit={setEditing} onCancel={(o) => void cancel(o)} />;
          }}
        />
      )}
    </div>
  );
}
