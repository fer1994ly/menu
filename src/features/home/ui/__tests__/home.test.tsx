import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeInstantForWeek } from '@/shared/kernel/time';
import { bootServices, renderApp, WEEK } from '@/test-utils/harness';

describe('Inicio', () => {
  it('shows the current week, the order figures and the calculate button', async () => {
    const h = await bootServices();
    renderApp(h.services);
    expect(await screen.findByRole('heading', { name: /domingo 15\/11\/2026/ })).toBeInTheDocument();
    expect(await screen.findByTestId('orders-count')).toHaveTextContent('50');
    expect(screen.getByTestId('total-portions')).toHaveTextContent('300');
    expect(screen.getByTestId('gluten-free-portions')).toHaveTextContent('25');
    expect(screen.getByTestId('quota-used')).toHaveTextContent('300/600');
    expect(screen.getByTestId('plan-status')).toHaveTextContent('sin calcular');
    expect(screen.getByRole('button', { name: 'Calcular producción' })).toBeVisible();
    expect(screen.getByLabelText('Semana')).toHaveValue(WEEK);
  });

  it('counts down to the Saturday close and says «Cerrado» afterwards', async () => {
    const h = await bootServices();
    const { unmount } = renderApp(h.services);
    // Friday 10:00 -> Saturday 11:30 = 25 h 30 min
    expect(await screen.findByTestId('countdown')).toHaveTextContent('25:30:00');
    unmount();
    h.time.now = closeInstantForWeek(WEEK) + 60_000;
    renderApp(h.services);
    await waitFor(() => expect(screen.getByTestId('countdown')).toHaveTextContent('Cerrado'));
  });

  it('calculates the production plan (briefing case 1) and links to the plan', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services);
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    const summary = await screen.findByTestId('plan-summary');
    expect(within(summary).getByText(/\$14\.710,50/)).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Ver el plan' })).toHaveAttribute('href', '/plan');
    expect(screen.getByTestId('plan-status')).toHaveTextContent('calculado');
    const record = await h.services.plans.getRecord(WEEK);
    expect(record?.outcome.status === 'optimal' && record.outcome.integer.map((p) => p.portions)).toEqual([79, 39, 64, 58, 30, 30]);
    expect(record?.outcome.status === 'optimal' && record.outcome.warnings).toEqual([]);
  });

  it('shows the failure message when there is no plan', async () => {
    const user = userEvent.setup();
    const h = await bootServices({ chickenCapG: 10_000 });
    renderApp(h.services);
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    expect(
      await screen.findByText('No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('plan-status')).toHaveTextContent('sin solución');
  });

  it('shows an empty state when the week has no orders', async () => {
    const h = await bootServices({ caseOne: false });
    renderApp(h.services);
    expect(await screen.findByText('Todavía no hay pedidos para esta semana')).toBeInTheDocument();
  });

  it('changes the week from the selector', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services);
    await user.selectOptions(await screen.findByLabelText('Semana'), '2026-11-22');
    expect(await screen.findByRole('heading', { name: /domingo 22\/11\/2026/ })).toBeInTheDocument();
    expect(await screen.findByText('Todavía no hay pedidos para esta semana')).toBeInTheDocument();
  });
});
