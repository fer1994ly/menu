import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { bootServices, FRIDAY, renderApp, WEEK, type Harness } from '@/test-utils/harness';

async function makeChanges(h: Harness): Promise<void> {
  h.services.session.set('Beto');
  const r1 = (await h.services.repos.recipes.get('R1'))!;
  await h.services.changes.saveRecipe({ ...r1, cost: 50 });
  h.services.session.set('Ana');
  const order = (await h.services.repos.orders.get('o-000001'))!;
  await h.services.changes.saveOrder(order, { ...order, route: 'morning' });
}

describe('Historial', () => {
  it('lists events with user, date-time, entity, field and old → new values', async () => {
    const h = await bootServices();
    await makeChanges(h);
    renderApp(h.services, '/historial');
    const rows = await screen.findAllByTestId('history-event');
    const costRow = rows.find((row) => row.textContent?.includes('R1') && row.textContent?.includes('cost')) as HTMLElement;
    expect(costRow).toHaveTextContent('Beto');
    expect(costRow).toHaveTextContent('Receta R1');
    expect(costRow).toHaveTextContent('48.5 → 50');
    expect(costRow).toHaveTextContent('2026-11-13 10:00:00');
    const routeRow = rows.find((row) => row.textContent?.includes('route:')) as HTMLElement;
    expect(routeRow).toHaveTextContent('Pedido P-000001');
    expect(routeRow).toHaveTextContent('open → morning');
  });

  it('filters by entity type, user and order or recipe code', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    await makeChanges(h);
    renderApp(h.services, '/historial');
    await screen.findAllByTestId('history-event');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'recipe');
    await waitFor(() => screen.getAllByTestId('history-event').forEach((row) => expect(row).toHaveTextContent('Receta')));
    await user.selectOptions(screen.getByLabelText('Tipo'), '');

    await user.selectOptions(await screen.findByLabelText('Usuario'), 'Ana');
    await waitFor(() => screen.getAllByTestId('history-event').forEach((row) => expect(row).toHaveTextContent('Ana')));
    await user.selectOptions(screen.getByLabelText('Usuario'), '');

    await user.type(screen.getByLabelText('Pedido o receta'), 'P-000001');
    await waitFor(() => screen.getAllByTestId('history-event').forEach((row) => expect(row).toHaveTextContent('Pedido P-000001')));
    await user.clear(screen.getByLabelText('Pedido o receta'));
    await user.type(screen.getByLabelText('Pedido o receta'), 'R1');
    await waitFor(() => screen.getAllByTestId('history-event').forEach((row) => expect(row).toHaveTextContent('Receta R1')));
  });

  it('highlights conflicts and shows the notice with both values', async () => {
    const h = await bootServices();
    const loaded = (await h.services.repos.orders.get('o-000001'))!;
    await h.services.changes.saveOrder(loaded, { ...loaded, plan: 10, portions: 10 });
    h.time.now += 5000;
    await h.services.changes.saveOrder(loaded, { ...loaded, route: 'morning' });
    renderApp(h.services, '/historial');
    const conflicts = await screen.findAllByTestId('history-conflict');
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]).toHaveTextContent('Conflicto en el pedido P-000001');
    expect(conflicts[0]).toHaveAttribute('data-kind', 'conflict');
  });

  it('shows the 50 step undo budget and undoes from the history screen', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/historial');
    expect(await screen.findByTestId('undo-depth')).toHaveTextContent('0 de 50');
    const r1 = (await h.services.repos.recipes.get('R1'))!;
    await act(async () => {
      await h.services.changes.saveRecipe({ ...r1, cost: 50 });
    });
    await waitFor(() => expect(screen.getByTestId('undo-depth')).toHaveTextContent('1 de 50'));
    const panel = screen.getByTestId('history-undo');
    await user.click(within(panel).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await h.services.repos.recipes.get('R1'))?.cost).toBe(48.5));
    await waitFor(() => expect(screen.getAllByTestId('history-event').some((row) => row.getAttribute('data-kind') === 'undo')).toBe(true));
  });
});

describe('Estado al…', () => {
  it('says «Antes del primer registro» for an instant before the first event', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    await makeChanges(h);
    renderApp(h.services, '/historial');
    const input = await screen.findByLabelText('Fecha y hora (hora de Monterrey)');
    await user.clear(input);
    await user.type(input, '2026-01-05T09:00');
    await user.click(screen.getByRole('button', { name: 'Ver estado' }));
    expect(await screen.findByTestId('state-at-notice')).toHaveTextContent('Antes del primer registro');
  });

  it('rebuilds Saturday 11:00: orders, D, G and the portions that would have been cooked', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    // An order that entered between 11:00 and the close must not count at 11:00.
    const late = { ...(await h.services.repos.orders.get('o-000001'))!, id: 'o-000099', code: 'P-000099', createdAt: closeInstantForWeek(WEEK) - 15 * 60_000, updatedAt: closeInstantForWeek(WEEK) - 15 * 60_000 };
    await h.services.repos.orders.put(late);
    h.time.now = FRIDAY;
    const order = (await h.services.repos.orders.get('o-000001'))!;
    await h.services.changes.saveOrder(order, { ...order, route: 'morning' }); // does not change D or G
    renderApp(h.services, '/historial');
    await user.click(await screen.findByRole('button', { name: 'Sábado 11:00 de la semana elegida' }));
    await waitFor(() => expect(screen.getByTestId('state-at-orders')).toHaveTextContent('50'));
    expect(screen.getByTestId('state-at-d')).toHaveTextContent('300');
    expect(screen.getByTestId('state-at-g')).toHaveTextContent('25');
    const table = screen.getByTestId('state-at-table');
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(cells).toEqual(['79', '39', '64', '58', '30', '30']);
    expect(screen.getByTestId('state-at-cost')).toHaveTextContent('$14.710,50');
    expect(screen.queryByTestId('state-at-notice')).not.toBeInTheDocument();
  });
});
