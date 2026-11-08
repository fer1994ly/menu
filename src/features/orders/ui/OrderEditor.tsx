import { useState } from 'react';
import { ROUTE_DEFINITIONS, ROUTE_IDS, type RouteId } from '@/features/routes/domain/routes';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import type { Order, OrderPlan } from '../domain/order';

export interface OrderEdit {
  plan: OrderPlan;
  route: RouteId;
  glutenFree: boolean;
}

/** Presentational form: plan, route and gluten-free of one order. */
export function OrderEditor({ order, busy, onSave, onClose }: { order: Order; busy: boolean; onSave(edit: OrderEdit): void; onClose(): void }) {
  const [plan, setPlan] = useState<OrderPlan>(order.plan);
  const [route, setRoute] = useState<RouteId>(order.route);
  const [glutenFree, setGlutenFree] = useState(order.glutenFree);
  return (
    <Card title={`Editar ${order.code} · ${order.clientName}`} data-testid="order-editor">
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ plan, route, glutenFree });
        }}
      >
        <Field label="Plan">
          {(c) => (
            <select {...c} className={INPUT_CLASS} value={plan} onChange={(e) => setPlan(Number(e.target.value) as OrderPlan)}>
              <option value={5}>Plan 5</option>
              <option value={10}>Plan 10</option>
            </select>
          )}
        </Field>
        <Field label="Ruta">
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
        <label className="flex min-h-11 items-center gap-2 self-end font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={glutenFree} onChange={(e) => setGlutenFree(e.target.checked)} />
          Sin gluten
        </label>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" disabled={busy}>
            Guardar cambios
          </Button>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </form>
    </Card>
  );
}
