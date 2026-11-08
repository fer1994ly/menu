import { ROUTE_DEFINITIONS } from '@/features/routes/domain/routes';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import type { Order } from '../domain/order';

export const ORDER_ROW_HEIGHT = 92;

/** Presentational row: two lines so it reads well at 360 px. */
export function OrderRow({ order, onEdit, onCancel }: { order: Order; onEdit(order: Order): void; onCancel(order: Order): void }) {
  const cancelled = order.status === 'cancelled';
  return (
    <div data-testid="order-row" className={`flex h-full flex-col justify-center gap-1 border-b border-navy/10 px-3 ${cancelled ? 'bg-neutral/60 text-navy/60' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{order.clientName}</span>
        <span className="tabular text-sm">{order.code}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1 text-sm">
          <Badge tone="neutral">Plan {order.plan}</Badge>
          <span>{ROUTE_DEFINITIONS[order.route].label}</span>
          {order.glutenFree && <Badge tone="ok">Sin gluten</Badge>}
          {cancelled && <Badge tone="warning">Cancelado</Badge>}
        </span>
        {!cancelled && (
          <span className="flex gap-1">
            <Button className="min-h-9 px-2 py-1 text-sm" aria-label={`Editar ${order.code}`} onClick={() => onEdit(order)}>
              Editar
            </Button>
            <Button variant="danger" className="min-h-9 px-2 py-1 text-sm" aria-label={`Cancelar ${order.code}`} onClick={() => onCancel(order)}>
              Cancelar
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
