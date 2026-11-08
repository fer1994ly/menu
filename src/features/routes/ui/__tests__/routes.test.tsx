import { screen, within } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { bootServices, renderApp } from '@/test-utils/harness';

describe('Rutas', () => {
  it('shows schedule, charge, quota and occupancy of the three Sunday routes', async () => {
    const h = await bootServices();
    renderApp(h.services, '/rutas');
    const open = await screen.findByTestId('route-open');
    expect(within(open).getByText('Ruta abierta 8:00–17:00')).toBeInTheDocument();
    expect(within(open).getByText('Sin cargo')).toBeInTheDocument();
    expect(within(open).getByTestId('route-open-used')).toHaveTextContent('47 de 90');
    expect(within(open).getByTestId('route-open-free')).toHaveTextContent('43 libres');
    const morning = screen.getByTestId('route-morning');
    expect(within(morning).getByText('$99,00')).toBeInTheDocument();
    expect(screen.getByTestId('route-morning-used')).toHaveTextContent('3 de 30');
    expect(screen.getByTestId('route-afternoon-used')).toHaveTextContent('0 de 30');
  });

  it('lists the orders of each route and explains the automatic move to the open route', async () => {
    const h = await bootServices();
    renderApp(h.services, '/rutas');
    const morningList = await screen.findByTestId('route-morning-orders');
    expect(within(morningList).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/pasa a la ruta abierta/)).toBeInTheDocument();
  });

  it('marks a full route', async () => {
    const h = await bootServices();
    await h.services.changes.saveSettings({ ...DEFAULT_SETTINGS, routeQuotas: { open: 90, morning: 3, afternoon: 30 } });
    renderApp(h.services, '/rutas');
    expect(await screen.findByTestId('route-morning-free')).toHaveTextContent('Llena');
  });
});
