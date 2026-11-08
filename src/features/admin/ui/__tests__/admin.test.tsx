import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_KEY } from '../../domain/adminKey';
import { bootServices, renderApp, WEEK } from '@/test-utils/harness';

describe('Ajustes', () => {
  it('records the operator name, links to /admin and notes the sample nutrition data', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/ajustes');
    expect(await screen.findByRole('link', { name: 'Ir al panel de administración' })).toHaveAttribute('href', '/admin');
    expect(screen.getByText(/validados por un profesional de la nutrición/)).toBeInTheDocument();
    const input = screen.getByLabelText('Nombre del operador');
    await user.clear(input);
    await user.type(input, 'Lupita');
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(h.services.session.get()).toBe('Lupita');
    expect(await screen.findByText('Ahora los cambios quedan a nombre de Lupita.')).toBeInTheDocument();
  });

  it('asks for confirmation in the page, then restores the sample data and shows the report', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    const restore = vi.spyOn(h.services, 'restoreSampleData').mockResolvedValue({ seeded: true, elapsedMs: 1234, currentWeekId: WEEK });
    renderApp(h.services, '/ajustes');
    await user.click(await screen.findByRole('button', { name: 'Restaurar datos de ejemplo' }));
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByText(/Esto borra todos los datos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No, volver' }));
    expect(screen.queryByText(/Esto borra todos los datos/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restaurar datos de ejemplo' }));
    await user.click(screen.getByRole('button', { name: 'Sí, restaurar' }));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('restore-report')).toHaveTextContent('1.234 ms');
    expect(screen.getByTestId('restore-report')).toHaveTextContent('domingo 15/11/2026');
  });
});

describe('Admin', () => {
  const unlock = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByLabelText('Clave de administración'), ADMIN_KEY);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
  };

  it('says the key is not real authentication and rejects a wrong key', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/admin');
    expect(await screen.findByText(/no es autenticación real/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Clave de administración'), 'mal');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Clave incorrecta')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-form')).not.toBeInTheDocument();
  });

  it('saves settings with field errors, and the change is undoable', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    await h.services.plans.calculate(WEEK);
    renderApp(h.services, '/admin');
    await unlock(user);
    const form = await screen.findByTestId('admin-form');

    const chicken = within(form).getByLabelText('Tope de pollo (kg)');
    expect(chicken).toHaveValue(26);
    await user.clear(chicken);
    await user.type(chicken, '-3');
    await user.click(within(form).getByRole('button', { name: 'Guardar ajustes' }));
    expect(await within(form).findByText('Valor fuera de rango')).toBeInTheDocument();
    expect((await h.services.repos.settings.get()).chickenCapG).toBe(26_000);

    await user.clear(chicken);
    await user.type(chicken, '30');
    const price = within(form).getByLabelText('Precio del paquete de pollo ($)');
    expect(price).toHaveValue(298);
    await user.click(within(form).getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByText(/Ajustes guardados/)).toBeInTheDocument();
    expect((await h.services.repos.settings.get()).chickenCapG).toBe(30_000);

    await user.click(screen.getAllByRole('button', { name: 'Deshacer' })[0] as HTMLElement);
    await waitFor(async () => expect((await h.services.repos.settings.get()).chickenCapG).toBe(26_000));
    await waitFor(() => expect(within(screen.getByTestId('admin-form')).getByLabelText('Tope de pollo (kg)')).toHaveValue(26));
  });

  it('edits close time, quotas, charges and the variety percentages', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    renderApp(h.services, '/admin');
    await unlock(user);
    const form = await screen.findByTestId('admin-form');
    const set = async (label: string, value: string) => {
      const field = within(form).getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    };
    await set('Hora de cierre del sábado', '12');
    await set('Cupo semanal (porciones)', '500');
    await set('Cupo de la ruta de mañana', '25');
    await set('Cargo de ruta de mañana y tarde ($)', '120.5');
    await set('Máximo por receta (% de D)', '35');
    await user.click(within(form).getByRole('button', { name: 'Guardar ajustes' }));
    await screen.findByText(/Ajustes guardados/);
    const saved = await h.services.repos.settings.get();
    expect(saved.closeTime.hour).toBe(12);
    expect(saved.weeklyPortionQuota).toBe(500);
    expect(saved.routeQuotas.morning).toBe(25);
    expect(saved.routeChargeCents).toBe(12_050);
    expect(saved.maxShare).toBeCloseTo(0.35, 10);
  });
});
