import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UNDO_EXHAUSTED_MESSAGE } from '@/features/history/application/ChangeService';
import { DEFAULT_SETTINGS } from '@/features/admin/domain/settings';
import { bootServices, renderApp, type Harness } from '@/test-utils/harness';
import { App } from '../App';
import { INDEXEDDB_UNAVAILABLE_MESSAGE } from '../container';
import { LoadingScreen } from '../GlobalScreens';

describe('app shell', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await bootServices();
  });

  it('shows the brand, the primary navigation and the operator selector', async () => {
    renderApp(h.services);
    expect(await screen.findByRole('heading', { name: 'Privee Food', level: 1 })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Principal' })[0] as HTMLElement;
    for (const label of ['Inicio', 'Pedidos', 'Plan', 'Compras', 'Más']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('records the operator name in the session user', async () => {
    const user = userEvent.setup();
    renderApp(h.services);
    const input = await screen.findByLabelText('Operador');
    await user.clear(input);
    await user.type(input, 'Beto{Enter}');
    expect(h.services.session.get()).toBe('Beto');
  });

  it('undo is unavailable at first and says why when tapped', async () => {
    const user = userEvent.setup();
    renderApp(h.services);
    const undo = await screen.findByRole('button', { name: 'Deshacer' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(undo).toHaveAttribute('title', UNDO_EXHAUSTED_MESSAGE);
    await user.click(undo);
    expect(screen.getByText(UNDO_EXHAUSTED_MESSAGE)).toBeInTheDocument();
  });

  it('undo and redo work after a change', async () => {
    const user = userEvent.setup();
    renderApp(h.services);
    const undo = await screen.findByRole('button', { name: 'Deshacer' });
    await act(async () => {
      await h.services.changes.saveSettings({ ...DEFAULT_SETTINGS, chickenCapG: 30_000 });
    });
    await waitFor(() => expect(undo).toHaveAttribute('aria-disabled', 'false'));
    await user.click(undo);
    await waitFor(async () => expect((await h.services.repos.settings.get()).chickenCapG).toBe(DEFAULT_SETTINGS.chickenCapG));
    const redo = screen.getByRole('button', { name: 'Rehacer' });
    await waitFor(() => expect(redo).toHaveAttribute('aria-disabled', 'false'));
    await user.click(redo);
    await waitFor(async () => expect((await h.services.repos.settings.get()).chickenCapG).toBe(30_000));
  });

  it('shows a toast when another tab changes data', async () => {
    renderApp(h.services);
    await screen.findByRole('heading', { name: 'Privee Food', level: 1 });
    act(() => {
      h.otherTab.publish({ type: 'changed', entity: 'order', id: 'o-000001', version: 2, savedAt: 1, tabId: 'tab-other' });
    });
    expect(await screen.findByText('Otra pestaña cambió un pedido')).toBeInTheDocument();
  });

  it('shows a link home on unknown routes', async () => {
    renderApp(h.services, '/no-existe');
    expect(await screen.findByRole('heading', { name: 'Esta página no existe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});

describe('global states', () => {
  it('blocks the whole screen when IndexedDB is unavailable', async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      render(<App />);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(INDEXEDDB_UNAVAILABLE_MESSAGE);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: real, writable: true });
    }
  });

  it('shows progress text while the data is prepared', () => {
    render(<LoadingScreen />);
    expect(screen.getByText(/Preparando los datos/)).toBeInTheDocument();
  });
});
