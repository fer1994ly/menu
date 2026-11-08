import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bootServices, cancelPlan5Orders, renderApp, WEEK } from '@/test-utils/harness';

const NO_SOLUTION =
  'No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.';

const column = (table: HTMLElement, index: number): string[] =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => (within(row).getAllByRole('cell')[index] as HTMLElement).textContent ?? '');

describe('Plan', () => {
  it('shows an empty state with the calculate button before the first calculation', async () => {
    const h = await bootServices();
    renderApp(h.services, '/plan');
    expect(await screen.findByText('Todavía no hay un plan calculado para esta semana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular producción' })).toBeInTheDocument();
  });

  it('briefing case 1: continuous and integer solutions side by side, costs, averages, caps, no warnings', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));

    const integer = await screen.findByTestId('integer-table');
    const continuous = screen.getByTestId('continuous-table');
    expect(column(integer, 2)).toEqual(['79', '39', '64', '58', '30', '30']);
    expect(column(continuous, 2)).toEqual(['79,07', '38,33', '64,26', '58,33', '30,00', '30,00']);
    expect(screen.getByTestId('continuous-cost')).toHaveTextContent('$14.700,56');
    expect(screen.getByTestId('integer-cost')).toHaveTextContent('$14.710,50');
    expect(screen.getByTestId('avg-kcal')).toHaveTextContent('544,80');
    expect(screen.getByTestId('avg-protein')).toHaveTextContent('37,00');
    expect(screen.getByTestId('plan-d')).toHaveTextContent('300');
    expect(screen.getByTestId('plan-g')).toHaveTextContent('25');
    expect(screen.getByTestId('elapsed-ms')).toHaveTextContent(/ms/);
    expect(screen.getByRole('progressbar', { name: 'Uso del tope de pollo' })).toHaveAttribute('aria-valuenow', '25940');
    expect(screen.getByRole('progressbar', { name: 'Uso del tope de res' })).toHaveAttribute('aria-valuenow', '13280');
    expect(screen.queryByTestId('plan-warnings')).not.toBeInTheDocument();
  });

  it('briefing case 2: shows the protein warning ABOVE the plan as text', async () => {
    const user = userEvent.setup();
    const h = await bootServices({ chickenCapG: 13_000 });
    await cancelPlan5Orders(h.services, 29); // D = 155, G = 25
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));

    const warnings = await screen.findByTestId('plan-warnings');
    expect(within(warnings).getByText('Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g')).toBeInTheDocument();
    const table = screen.getByTestId('integer-table');
    expect(warnings.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(column(table, 2)).toEqual(['46', '21', '37', '20', '16', '15']);
  });

  it('briefing case 4: R4 blocked by rotation, chicken cap broken by rounding', async () => {
    const user = userEvent.setup();
    const h = await bootServices({ blocked: ['R4'], glutenFreePortions: 180 });
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    const warnings = await screen.findByTestId('plan-warnings');
    expect(within(warnings).getByText('Las porciones enteras superan el tope de pollo en 40 g')).toBeInTheDocument();
    expect(column(screen.getByTestId('integer-table'), 2)).toEqual(['90', '57', '41', '30', '82']);
    expect(screen.getByText(/Fuera por rotación: R4/)).toBeInTheDocument();
  });

  it('briefing case 3: exact no-solution message and nothing else to cook', async () => {
    const user = userEvent.setup();
    const h = await bootServices({ chickenCapG: 10_000 });
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    expect(await screen.findByTestId('plan-failure')).toHaveTextContent(NO_SOLUTION);
    expect(screen.queryByTestId('integer-table')).not.toBeInTheDocument();
  });

  it('keeps showing the previous plan when a recalculation has no solution, and flags it as stale', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    await screen.findByTestId('integer-table');
    await h.services.changes.saveMenu({ weekId: WEEK, recipeCodes: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], chickenCapG: 10_000, beefCapG: 20_000 });
    expect(await screen.findByText('desactualizado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calcular producción' }));
    expect(await screen.findByTestId('plan-failure')).toHaveTextContent(NO_SOLUTION);
    expect(screen.getByText(/Se conserva el plan anterior/)).toBeInTheDocument();
    expect(screen.getByTestId('integer-table')).toBeInTheDocument();
  });

  it('flags the plan as «desactualizado» when a recipe price changes', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    await screen.findByTestId('integer-table');
    expect(screen.queryByText('desactualizado')).not.toBeInTheDocument();
    const recipe = (await h.services.repos.recipes.get('R1'))!;
    await h.services.changes.saveRecipe({ ...recipe, cost: 50 });
    expect(await screen.findByTestId('stale-badge')).toHaveTextContent('desactualizado');
  });

  it('recalculates the stored weeks and reports the elapsed time while a spinner shows', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    await screen.findByTestId('integer-table');
    await user.click(screen.getByRole('button', { name: 'Recalcular las 52 semanas' }));
    expect(await screen.findByTestId('recalc-result')).toHaveTextContent(/1 semana recalculada en .* ms/);
  });
});

describe('Explicación del cálculo', () => {
  it('asks to calculate when the week has no plan', async () => {
    const h = await bootServices();
    renderApp(h.services, '/plan/explicacion');
    expect(await screen.findByText('Todavía no hay un plan calculado para esta semana')).toBeInTheDocument();
  });

  it('shows the model, the real pivots, the final tableau and the largest-remainder table', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/plan');
    await user.click(await screen.findByRole('button', { name: 'Calcular producción' }));
    await screen.findByTestId('integer-table');
    await user.click(screen.getByRole('link', { name: 'Cómo se calculó' }));

    expect(await screen.findByRole('heading', { name: 'Modelo' })).toBeInTheDocument();
    expect(screen.getAllByText('Tope de pollo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mínimo de R1').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('initial-tableau').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('pivot-step').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('final-tableau').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: /Fase 1/ })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /Fase 2/ })[0]).toBeInTheDocument();

    const rounding = screen.getByTestId('rounding-table');
    const rows = within(rounding).getAllByRole('row').slice(1);
    const r2 = rows.find((row) => within(row).getAllByRole('cell')[0]?.textContent === 'R2') as HTMLElement;
    const r4 = rows.find((row) => within(row).getAllByRole('cell')[0]?.textContent === 'R4') as HTMLElement;
    expect(within(r2).getByText('+1')).toBeInTheDocument();
    expect(within(r2).getByText('0,333333')).toBeInTheDocument();
    expect(within(r4).queryByText('+1')).not.toBeInTheDocument();
    await waitFor(() => expect(within(rounding).getAllByRole('row')).toHaveLength(7));
  });
});
