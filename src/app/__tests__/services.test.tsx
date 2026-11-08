import { render, screen, waitFor } from '@testing-library/react';
import { uniqueDbName } from '@/features/history/__tests__/helpers';
import { InlinePlanRunner } from '@/features/planning/infrastructure/planWorkerClient';
import { InMemorySyncHub } from '@/shared/infrastructure/syncChannel';
import { AppServicesProvider, useIndexedDbGuard, useServices } from '../AppServicesProvider';
import { createAppServices, INDEXEDDB_UNAVAILABLE_MESSAGE } from '../container';
import { createSessionUser, DEFAULT_USER } from '../sessionUser';

function Probe() {
  const services = useServices();
  const guard = useIndexedDbGuard();
  return (
    <p>
      {guard.status}:{services.session.get()}:{services.tabId}
    </p>
  );
}

describe('AppServicesProvider', () => {
  it('opens the database, then exposes the services through useServices()', async () => {
    render(
      <AppServicesProvider
        loading={<p>cargando</p>}
        options={{ dbName: uniqueDbName(), seed: false, runner: new InlinePlanRunner(), bus: new InMemorySyncHub().connect(), tabId: 'tab-x' }}
      >
        <Probe />
      </AppServicesProvider>,
    );
    expect(screen.getByText('cargando')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(`ready:${DEFAULT_USER}:tab-x`)).toBeInTheDocument());
  });

  it('renders the blocking notice when IndexedDB is unavailable', async () => {
    const real = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      expect(await createAppServices({ seed: false })).toEqual({ status: 'unavailable', message: INDEXEDDB_UNAVAILABLE_MESSAGE });
      render(
        <AppServicesProvider unavailable={(message) => <p role="alert">{message}</p>}>
          <Probe />
        </AppServicesProvider>,
      );
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(INDEXEDDB_UNAVAILABLE_MESSAGE));
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: real, writable: true });
    }
  });

  it('useServices throws outside a ready provider', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Probe />)).toThrow(/AppServicesProvider/);
    } finally {
      silence.mockRestore();
    }
  });
});

describe('createSessionUser', () => {
  it('remembers the operator name per tab and survives blocked storage', () => {
    const store = new Map<string, string>();
    const user = createSessionUser({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) });
    expect(user.get()).toBe(DEFAULT_USER);
    user.set('  Beto ');
    expect(user.get()).toBe('Beto');
    user.set('');
    expect(user.get()).toBe(DEFAULT_USER);

    const blocked = createSessionUser({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    blocked.set('Ana');
    expect(blocked.get()).toBe('Ana');
    expect(createSessionUser(null).get()).toBe(DEFAULT_USER);
  });
});
