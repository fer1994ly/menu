import type { SettingsRepository } from '@/features/admin/application/ports';
import type { ClientsRepository } from '@/features/clients/application/ports';
import type { ChangeService } from '@/features/history/application/ChangeService';
import type { Clock } from '@/shared/kernel/runtime';
import { weekIdForInstant } from '@/shared/kernel/time';
import type { PlaceOrderResult, PlaceOrderRequest } from '../domain/order';
import { placeOrder } from '../domain/placeOrder';
import type { OrdersRepository } from './ports';

export type NewOrderRequest = Omit<PlaceOrderRequest, 'id' | 'code' | 'clientName'>;

export class UnknownClientError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} does not exist`);
  }
}

export interface OrderServiceDeps {
  orders: OrdersRepository;
  clients: ClientsRepository;
  settings: SettingsRepository;
  changes: ChangeService;
  clock: Clock;
}

/** Creates orders applying the close, weekly quota and route rules, through the ChangeService. */
export class OrderService {
  constructor(private readonly deps: OrderServiceDeps) {}

  async place(request: NewOrderRequest): Promise<PlaceOrderResult> {
    const client = await this.deps.clients.get(request.clientId);
    if (!client) throw new UnknownClientError(request.clientId);
    const settings = await this.deps.settings.get();
    const now = this.deps.clock();
    let result!: PlaceOrderResult;
    // Quota check and write share one transaction, so a concurrent tab cannot take the last slot in between.
    const order = await this.deps.orders.placeAtomically(weekIdForInstant(now, settings.closeTime), (existingOrders, number) => {
      const padded = String(number).padStart(6, '0');
      result = placeOrder(
        { ...request, id: `o-${padded}`, code: `P-${padded}`, clientName: client.name },
        {
          now,
          existingOrders,
          weeklyPortionQuota: settings.weeklyPortionQuota,
          routeQuotas: settings.routeQuotas,
          routeChargesCents: { open: 0, morning: settings.routeChargeCents, afternoon: settings.routeChargeCents },
          closeTime: settings.closeTime,
        },
      );
      return result.order;
    });
    await this.deps.changes.createOrder(order, { alreadyStored: true });
    return result;
  }
}
