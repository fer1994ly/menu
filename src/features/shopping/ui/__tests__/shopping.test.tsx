import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bootServices, renderApp, WEEK } from '@/test-utils/harness';

const readBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('Compras', () => {
  it('lists grams, packages, cost and leftover per input (briefing case 1)', async () => {
    const h = await bootServices();
    await h.services.plans.calculate(WEEK);
    renderApp(h.services, '/compras');
    const table = await screen.findByTestId('shopping-table');
    const chicken = within(table).getByText('Pollo').closest('tr') as HTMLElement;
    expect(chicken).toHaveTextContent('25.940 g');
    expect(chicken).toHaveTextContent('2.000 g');
    expect(chicken).toHaveTextContent('13');
    expect(chicken).toHaveTextContent('$3.874,00');
    expect(chicken).toHaveTextContent('60 g');
    const beef = within(table).getByText('Res').closest('tr') as HTMLElement;
    expect(beef).toHaveTextContent('13.280 g');
    expect(beef).toHaveTextContent('14');
    expect(beef).toHaveTextContent('$3.066,00');
    expect(beef).toHaveTextContent('720 g');
    expect(within(table).getByText('Total').closest('tr')).toHaveTextContent('$6.940,00');
  });

  it('exports the list as a UTF-8 CSV download named compras-<week>.csv', async () => {
    const user = userEvent.setup();
    const h = await bootServices();
    await h.services.plans.calculate(WEEK);
    let blob: Blob | null = null;
    let filename = '';
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob;
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
    renderApp(h.services, '/compras');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    expect(filename).toBe(`compras-${WEEK}.csv`);
    const bytes = await readBytes(blob as unknown as Blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('Pollo;25940;2000;13;3874,00;60');
    expect(text).toContain('Res;13280;1000;14;3066,00;720');
    click.mockRestore();
  });

  it('says there is no shopping list when the week has no possible plan', async () => {
    const h = await bootServices({ chickenCapG: 10_000 });
    await h.services.plans.calculate(WEEK);
    renderApp(h.services, '/compras');
    expect(await screen.findByText('No hay lista de compras porque no hay plan de producción posible.')).toBeInTheDocument();
    expect(screen.queryByTestId('shopping-table')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument());
  });

  it('asks to calculate when there is no plan yet', async () => {
    const h = await bootServices();
    renderApp(h.services, '/compras');
    expect(await screen.findByText('Todavía no hay un plan calculado para esta semana')).toBeInTheDocument();
  });
});
