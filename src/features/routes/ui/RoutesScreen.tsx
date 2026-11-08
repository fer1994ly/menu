import { useServices } from '@/app/AppServicesProvider';
import type { Order } from '@/features/orders/domain/order';
import { formatMoney } from '@/shared/kernel/numberFormat';
import { Badge, UsageBar } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { Notice } from '@/shared/ui/Notice';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { useLiveData } from '@/shared/ui/liveData';
import { useWeek } from '@/shared/ui/weekContext';
import { ROUTE_DEFINITIONS, ROUTE_IDS, routeOccupancy, type RouteId, type RouteOccupancy } from '../domain/routes';

interface RoutesData {
  occupancy: Record<RouteId, RouteOccupancy>;
  ordersByRoute: Record<RouteId, Order[]>;
  chargeCents: Record<RouteId, number>;
}

function RouteCard({ id, occupancy, orders, chargeCents }: { id: RouteId; occupancy: RouteOccupancy; orders: Order[]; chargeCents: number }) {
  const definition = ROUTE_DEFINITIONS[id];
  return (
    <Card title={definition.label} data-testid={`route-${id}`}>
      <p className="mb-2">
        Horario {definition.from}–{definition.to} ·{' '}
        <strong>{chargeCents === 0 ? 'Sin cargo' : formatMoney(chargeCents / 100)}</strong>
      </p>
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="font-heading text-3xl tabular" data-testid={`route-${id}-used`}>
          {occupancy.used} de {occupancy.quota}
        </strong>
        <span data-testid={`route-${id}-free`}>
          {occupancy.full ? <Badge tone="warning">Llena</Badge> : `${occupancy.free} libres`}
        </span>
      </p>
      <div className="my-2">
        <UsageBar used={occupancy.used} cap={occupancy.quota} label={`Ocupación de la ruta ${definition.label}`} />
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Pedidos de esta ruta ({orders.length})</summary>
        {orders.length === 0 ? (
          <p>No hay pedidos en esta ruta.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-navy/10 overflow-y-auto" data-testid={`route-${id}-orders`}>
            {orders.map((order) => (
              <li key={order.id} className="flex justify-between gap-2 py-1 tabular">
                <span>
                  {order.code} · {order.clientName}
                </span>
                <span>Plan {order.plan}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Card>
  );
}

export function RoutesScreen() {
  const { weekId } = useWeek();
  const { repos } = useServices();
  const { data, error } = useLiveData<RoutesData>(async () => {
    const [orders, settings] = await Promise.all([repos.orders.listByWeek(weekId), repos.settings.get()]);
    const confirmed = orders.filter((o) => o.status === 'confirmed');
    const ordersByRoute: Record<RouteId, Order[]> = { open: [], morning: [], afternoon: [] };
    for (const order of confirmed) ordersByRoute[order.route].push(order);
    return {
      occupancy: routeOccupancy(confirmed, weekId, settings.routeQuotas),
      ordersByRoute,
      chargeCents: { open: 0, morning: settings.routeChargeCents, afternoon: settings.routeChargeCents },
    };
  }, [weekId]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Rutas del domingo</h2>
      <WeekSelect className="max-w-xs" />
      <Notice>
        Si la ruta elegida está llena, el pedido pasa a la ruta abierta y no se cobra el cargo de ruta. Si la abierta también está llena, el pedido pasa entero a la semana
        siguiente. Los cupos se reinician cada domingo.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          {ROUTE_IDS.map((id) => (
            <RouteCard key={id} id={id} occupancy={data.occupancy[id]} orders={data.ordersByRoute[id]} chargeCents={data.chargeCents[id]} />
          ))}
        </div>
      )}
    </div>
  );
}
