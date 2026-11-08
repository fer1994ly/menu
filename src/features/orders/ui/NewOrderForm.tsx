import { useDeferredValue, useMemo, useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import type { Client } from '@/features/clients/domain/client';
import { ROUTE_DEFINITIONS, ROUTE_IDS, type RouteId } from '@/features/routes/domain/routes';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { formatWeekLabel } from '@/shared/ui/format';
import { useLiveData } from '@/shared/ui/liveData';
import type { OrderPlan, PlaceOrderResult } from '../domain/order';
import { normalizeSearch as normalize } from './ordersFilter';

const MAX_SUGGESTIONS = 6;

/** Container: creates an order through `OrderService` (close, quota and route rules) and shows every notice. */
export function NewOrderForm({ onClose }: { onClose(): void }) {
  const { orders, repos } = useServices();
  const { data: clients } = useLiveData<Client[]>(() => repos.clients.list(), []);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<OrderPlan>(5);
  const [glutenFree, setGlutenFree] = useState(false);
  const [route, setRoute] = useState<RouteId>('open');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const term = normalize(deferred.trim());
    if (!clients || term === '' || client) return [];
    return clients.filter((c) => normalize(c.name).includes(term)).slice(0, MAX_SUGGESTIONS);
  }, [clients, deferred, client]);

  const submit = async () => {
    if (!client) {
      setError('Elegí un cliente de la lista');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await orders.place({ clientId: client.id, plan, glutenFree, route }));
      setClient(null);
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el pedido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Nuevo pedido" actions={<Button onClick={onClose}>Cerrar</Button>}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="sm:col-span-2">
          <Field label="Cliente" error={error ?? undefined}>
            {(c) => (
              <input
                {...c}
                className={INPUT_CLASS}
                value={client ? client.name : query}
                autoComplete="off"
                placeholder="Escribí el nombre del cliente"
                onChange={(e) => {
                  setClient(null);
                  setQuery(e.target.value);
                }}
              />
            )}
          </Field>
          {suggestions.length > 0 && (
            <ul className="mt-1 divide-y divide-navy/10 rounded border-2 border-navy">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between px-3 text-left hover:bg-neutral"
                    onClick={() => {
                      setClient(c);
                      setError(null);
                    }}
                  >
                    <span>{c.name}</span>
                    <span className="tabular text-sm">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Plan">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={plan} onChange={(e) => setPlan(Number(e.target.value) as OrderPlan)}>
              <option value={5}>Plan 5 (5 porciones)</option>
              <option value={10}>Plan 10 (10 porciones)</option>
            </select>
          )}
        </Field>
        <Field label="Ruta del domingo">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={route} onChange={(e) => setRoute(e.target.value as RouteId)}>
              {ROUTE_IDS.map((id) => (
                <option key={id} value={id}>
                  {ROUTE_DEFINITIONS[id].label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={glutenFree} onChange={(e) => setGlutenFree(e.target.checked)} />
          Pedido sin gluten
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            Crear pedido
          </Button>
        </div>
      </form>
      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <Notice tone="ok" data-testid="order-created">
            Pedido {result.order.code} creado para {result.order.clientName} para la semana del {formatWeekLabel(result.order.weekId)}.
          </Notice>
          {result.notices.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="order-notices">
              {result.notices.map((notice) => (
                <Notice key={notice.kind} tone="warning">
                  {notice.message}
                </Notice>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
