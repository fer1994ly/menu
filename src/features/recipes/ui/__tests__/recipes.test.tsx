import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bootServices, renderApp, WEEK } from '@/test-utils/harness';

describe('Recetas', () => {
  it('shows a card per recipe with its nutrition, cost, meat grams and flags', async () => {
    const h = await bootServices();
    await h.services.repos.recipes.put({ ...(await h.services.repos.recipes.get('R1'))!, lastServedWeek: '2026-10-25' });
    renderApp(h.services, '/recetas');
    const card = await screen.findByTestId('recipe-R1');
    expect(card).toHaveTextContent('Pollo a la mostaza con arroz');
    expect(within(card).getByTestId('recipe-R1-kcal')).toHaveTextContent('520');
    expect(within(card).getByTestId('recipe-R1-protein')).toHaveTextContent('42');
    expect(within(card).getByTestId('recipe-R1-cost')).toHaveTextContent('$48,50');
    expect(within(card).getByTestId('recipe-R1-chicken')).toHaveTextContent('180 g');
    expect(within(card).getByTestId('recipe-R1-beef')).toHaveTextContent('0 g');
    expect(within(card).getByText('Sin gluten')).toBeInTheDocument();
    expect(card).toHaveTextContent('domingo 25/10/2026');
    expect(within(screen.getByTestId('recipe-R3')).queryByText('Sin gluten')).not.toBeInTheDocument();
  });

  it('rejects out of range values per field and saves nothing', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/recetas');
    await user.click(await screen.findByRole('button', { name: 'Editar R1' }));
    const form = screen.getByTestId('recipe-form');
    await user.clear(within(form).getByLabelText('Costo por porción'));
    await user.type(within(form).getByLabelText('Costo por porción'), '0');
    await user.clear(within(form).getByLabelText('Kcal'));
    await user.type(within(form).getByLabelText('Kcal'), '0');
    await user.clear(within(form).getByLabelText('Gramos de pollo'));
    await user.type(within(form).getByLabelText('Gramos de pollo'), '-5');
    await user.click(within(form).getByRole('button', { name: 'Guardar receta' }));
    expect(await within(form).findAllByText('Valor fuera de rango')).toHaveLength(3);
    expect(within(form).getByLabelText('Costo por porción')).toHaveAttribute('aria-invalid', 'true');
    expect((await h.services.repos.recipes.get('R1'))?.cost).toBe(48.5);
  });

  it('saves a valid edit, logs it and marks the plan as stale', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    await h.services.plans.calculate(WEEK);
    renderApp(h.services, '/recetas');
    await user.click(await screen.findByRole('button', { name: 'Editar R1' }));
    const form = screen.getByTestId('recipe-form');
    await user.clear(within(form).getByLabelText('Costo por porción'));
    await user.type(within(form).getByLabelText('Costo por porción'), '50');
    await user.click(within(form).getByRole('button', { name: 'Guardar receta' }));
    await waitFor(() => expect(screen.getByTestId('recipe-R1-cost')).toHaveTextContent('$50,00'));
    expect((await h.services.plans.getRecord(WEEK))?.stale).toBe(true);
  });

  it('creates a new recipe and refuses a duplicated code', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/recetas');
    await user.click(await screen.findByRole('button', { name: 'Nueva receta' }));
    const form = screen.getByTestId('recipe-form');
    const fill = async (label: string, value: string) => {
      await user.clear(within(form).getByLabelText(label));
      await user.type(within(form).getByLabelText(label), value);
    };
    await fill('Código', 'R1');
    await fill('Nombre', 'Otra receta');
    await fill('Kcal', '500');
    await fill('Proteína (g)', '40');
    await fill('Costo por porción', '45');
    await fill('Gramos de pollo', '100');
    await fill('Gramos de res', '0');
    await user.click(within(form).getByRole('button', { name: 'Guardar receta' }));
    expect(await within(form).findByText('Ese código ya existe')).toBeInTheDocument();
    await fill('Código', 'R7');
    await user.click(within(form).getByRole('button', { name: 'Guardar receta' }));
    expect(await screen.findByTestId('recipe-R7')).toHaveTextContent('Otra receta');
  });

  it('shows an empty state when the week menu has no recipes', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/recetas');
    await user.selectOptions(await screen.findByLabelText('Semana'), '2026-11-22');
    expect(await screen.findByText('El menú de esta semana no tiene recetas')).toBeInTheDocument();
  });

  it('edits the weekly menu: 6 recipes, caps in kg, rotation-blocked recipes flagged', async () => {
    const user = userEvent.setup();
    const h = await bootServices({ blocked: ['R4'] });
    renderApp(h.services, '/recetas');
    const editor = await screen.findByTestId('menu-editor');
    expect(within(editor).getByLabelText(/R4 /)).toBeChecked();
    expect(within(editor).getByText(/Bloqueada por rotación/)).toBeInTheDocument();
    expect(within(editor).getByLabelText('Tope de pollo (kg)')).toHaveValue(26);

    await user.click(within(editor).getByLabelText(/R6 /)); // 5 chosen
    await user.click(within(editor).getByRole('button', { name: 'Guardar menú' }));
    expect(await within(editor).findByText('Elegí 6 recetas para el menú (hay 5 elegidas)')).toBeInTheDocument();

    await user.click(within(editor).getByLabelText(/R6 /));
    await user.clear(within(editor).getByLabelText('Tope de pollo (kg)'));
    await user.type(within(editor).getByLabelText('Tope de pollo (kg)'), '30');
    await user.click(within(editor).getByRole('button', { name: 'Guardar menú' }));
    await waitFor(async () => expect((await h.services.repos.menus.get(WEEK))?.chickenCapG).toBe(30_000));
  });
});
