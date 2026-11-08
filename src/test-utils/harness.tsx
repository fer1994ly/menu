import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/App';
import { AppServicesProvider } from '@/app/AppServicesProvider';
import { createAppServices, type AppServices } from '@/app/container';
import { uniqueDbName } from '@/features/history/__tests__/helpers';
import type { Order } from '@/features/orders/domain/order';
import { TEST_RECIPES } from '@/features/planning/domain/__tests__/fixtures';
import { InlinePlanRunner } from '@/features/planning/infrastructure/planWorkerClient';
import { InMemorySyncHub, type SyncBus } from '@/shared/infrastructure/syncChannel';

/** Friday 2026-11-13 10:00 Monterrey: the week of Sunday 2026-11-15 is open. */
export const FRIDAY = Date.UTC(2026, 10, 13, 16, 0, 0);
export const WEEK = '2026-11-15';
export const PREVIOUS_WEEK = '2026-11-08';

export interface Harness {
  services: AppServices;
  time: { now: number };
  hub: InMemorySyncHub;
  /** Bus of a second (simulated) tab. */
  otherTab: SyncBus;
}

export interface HarnessOptions {
  now?: number;
  /** Seed the briefing case 1 week (300 portions, G = 25, caps 26 / 20 kg, menu R1–R6). Default true. */
  caseOne?: boolean;
  chickenCapG?: number;
  beefCapG?: number;
  /** Extra codes blocked by rotation (served the previous week). */
  blocked?: string[];
  glutenFreePortions?: number;
}

function makeOrder(n: number, plan: 5 | 10, glutenFree: boolean, route: Order['route'], clientId: string, clientName: string): Order {
  const padded = String(n).padStart(6, '0');
  return {
    id: `o-${padded}`,
    code: `P-${padded}`,
    clientId,
    clientName,
    plan,
    portions: plan,
    glutenFree,
    route,
    weekId: WEEK,
    status: 'confirmed',
    routeChargeCents: route === 'open' ? 0 : 9900,
    createdAt: FRIDAY - 3_600_000 * (n + 1),
    updatedAt: FRIDAY - 3_600_000 * (n + 1),
    version: 1,
  };
}

/** Real container over fake-indexeddb with a small, controlled data set (no 26.000-order seed). */
export async function bootServices(options: HarnessOptions = {}): Promise<Harness> {
  const time = { now: options.now ?? FRIDAY };
  const hub = new InMemorySyncHub();
  const result = await createAppServices({
    dbName: uniqueDbName(),
    clock: () => time.now,
    runner: new InlinePlanRunner(),
    bus: hub.connect(),
    tabId: 'tab-test',
    seed: false,
  });
  if (result.status !== 'ready') throw new Error('services not ready');
  const { services } = result;

  await services.repos.clients.putMany([
    { id: 'c-0001', name: 'Ana Garza', phone: '8110000001' },
    { id: 'c-0002', name: 'Luis Treviño', phone: '8110000002' },
    { id: 'c-0003', name: 'Marta Salinas', phone: '8110000003' },
  ]);
  await services.repos.recipes.putMany(TEST_RECIPES.map((r) => ({ ...r, active: true })));

  if (options.caseOne !== false) {
    await services.repos.menus.put({
      weekId: WEEK,
      recipeCodes: TEST_RECIPES.map((r) => r.code),
      chickenCapG: options.chickenCapG ?? 26_000,
      beefCapG: options.beefCapG ?? 20_000,
    });
    if (options.blocked?.length) await services.repos.menus.put({ weekId: PREVIOUS_WEEK, recipeCodes: options.blocked });
    const gfOrders = (options.glutenFreePortions ?? 25) / 5;
    const orders: Order[] = [];
    let n = 1;
    for (let i = 0; i < 35 - (gfOrders - 5); i += 1) orders.push(makeOrder(n++, 5, false, 'open', 'c-0001', 'Ana Garza'));
    for (let i = 0; i < gfOrders; i += 1) orders.push(makeOrder(n++, 5, true, 'open', 'c-0002', 'Luis Treviño'));
    for (let i = 0; i < 10; i += 1) orders.push(makeOrder(n++, 10, false, i < 3 ? 'morning' : 'open', 'c-0003', 'Marta Salinas'));
    await services.repos.orders.putMany(orders);
  }
  return { services, time, hub, otherTab: hub.connect() };
}

/** Renders the whole application (shell + routes) with the given services at `route`. */
export function renderApp(services: AppServices, route = '/') {
  return render(
    <AppServicesProvider services={services}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AppServicesProvider>,
  );
}
