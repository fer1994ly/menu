import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { bootServices, renderApp, WEEK } from '@/test-utils/harness';

const rows = () => screen.getAllByTestId('order-row');

describe('Pedidos', () => {
  it('lists the orders of the week in a virtualized table (only visible rows are rendered)', async () => {
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    expect(await screen.findByTestId('orders-total')).toHaveTextContent('50 pedidos · 300 porciones');
    expect(rows().length).toBeGreaterThan(3);
    expect(rows().length).toBeLessThan(50);
    expect(rows()[0]).toHaveTextContent('P-000001');
  });

  it('shows the empty state for a week without orders', async () => {
    const h = await bootServices({ caseOne: false });
    renderApp(h.services, '/pedidos');
    expect(await screen.findByText('Todavía no hay pedidos para esta semana')).toBeInTheDocument();
  });

  it('searches by client name or order code and filters by plan, route and gluten-free', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await screen.findByTestId('orders-total');

    await user.type(screen.getByLabelText('Buscar por cliente o código'), 'marta');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('10 pedidos'));
    await user.clear(screen.getByLabelText('Buscar por cliente o código'));
    await user.type(screen.getByLabelText('Buscar por cliente o código'), 'P-000001');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('1 pedido ·'));
    await user.clear(screen.getByLabelText('Buscar por cliente o código'));

    await user.selectOptions(screen.getByLabelText('Plan'), '10');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('10 pedidos · 100 porciones'));
    await user.selectOptions(screen.getByLabelText('Plan'), '');
    await user.selectOptions(screen.getByLabelText('Ruta'), 'morning');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('3 pedidos'));
    await user.selectOptions(screen.getByLabelText('Ruta'), '');
    await user.selectOptions(screen.getByLabelText('Sin gluten'), 'yes');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('5 pedidos · 25 porciones'));
  });

  it('edits an order through the change service', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Editar P-000001' }));
    const editor = screen.getByTestId('order-editor');
    await user.selectOptions(within(editor).getByLabelText('Ruta'), 'afternoon');
    await user.click(within(editor).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/Pedido P-000001 guardado/)).toBeInTheDocument();
    expect((await h.services.repos.orders.get('o-000001'))?.route).toBe('afternoon');
    const events = await h.services.repos.events.query({ entityId: 'o-000001' });
    expect(events.events.some((e) => e.field === 'route' && e.newValue === 'afternoon')).toBe(true);
  });

  it('refuses to edit an order of a closed week and shows why', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Editar P-000001' }));
    h.time.now = closeInstantForWeek(WEEK) + 60_000;
    const editor = screen.getByTestId('order-editor');
    await user.selectOptions(within(editor).getByLabelText('Ruta'), 'afternoon');
    await user.click(within(editor).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByTestId('order-feedback')).toHaveTextContent(
      'El pedido P-000001 es de una semana cerrada el sábado a las 11:30: ya no se puede cambiar porque la producción se calculó con él.',
    );
    expect((await h.services.repos.orders.get('o-000001'))?.route).not.toBe('afternoon');
  });

  it('cancels an order and gives the quota back', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Cancelar P-000001' }));
    expect(await screen.findByText(/Pedido P-000001 cancelado/)).toBeInTheDocument();
    expect((await h.services.repos.orders.get('o-000001'))?.status).toBe('cancelled');
    await waitFor(() => expect(screen.getByTestId('orders-total')).toHaveTextContent('49 pedidos'));
  });

  it('shows both values on a two-tab conflict and lets you choose the other one', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Editar P-000001' }));
    const editor = screen.getByTestId('order-editor');
    // The other tab saves first (plan 10)...
    const loaded = (await h.services.repos.orders.get('o-000001'))!;
    await h.services.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    h.time.now += 5000;
    // ...then this tab saves a different value.
    await user.selectOptions(within(editor).getByLabelText('Ruta'), 'morning');
    await user.click(within(editor).getByRole('button', { name: 'Guardar cambios' }));

    const notice = await screen.findByTestId('conflict-notice');
    expect(notice).toHaveTextContent('Conflicto en el pedido P-000001');
    expect(notice).toHaveTextContent('plan 10');
    expect(notice).toHaveTextContent('plan 5');
    await user.click(within(notice).getByRole('button', { name: 'Elegir el otro valor' }));
    await waitFor(async () => expect((await h.services.repos.orders.get('o-000001'))?.route).toBe('open'));
    const conflictEvents = (await h.services.repos.events.query({ entityId: 'o-000001' })).events.filter((e) => e.field === '_conflict');
    expect(conflictEvents).toHaveLength(1);
  });

  it('creates an order for the current week', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
    await user.type(screen.getByLabelText('Cliente'), 'Marta');
    await user.click(await screen.findByRole('button', { name: /Marta Salinas/ }));
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(await screen.findByTestId('order-created')).toHaveTextContent('para la semana del domingo 15/11/2026');
    expect(await h.services.repos.orders.listByWeek(WEEK)).toHaveLength(51);
  });

  it('after the Saturday close the new order goes to next week with a notice', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    h.time.now = closeInstantForWeek(WEEK) + 60_000;
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
    await user.type(screen.getByLabelText('Cliente'), 'Ana');
    await user.click(await screen.findByRole('button', { name: /Ana Garza/ }));
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));
    const notices = await screen.findByTestId('order-notices');
    expect(notices).toHaveTextContent('El pedido entró después del cierre del sábado a las 11:30: pasa a la semana del domingo 22/11.');
    expect(await h.services.repos.orders.listByWeek('2026-11-22')).toHaveLength(1);
  });

  it('asks to pick a client before creating', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/pedidos');
    await user.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));
    expect(await screen.findByText('Elegí un cliente de la lista')).toBeInTheDocument();
  });
});
