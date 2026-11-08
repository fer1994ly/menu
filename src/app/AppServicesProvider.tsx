import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createAppServices, type AppServices, type AppServicesOptions, type IndexedDbGuardResult } from './container';

const GuardContext = createContext<IndexedDbGuardResult>({ status: 'checking' });

export interface AppServicesProviderProps {
  children: ReactNode;
  /** Rendered while IndexedDB is being opened and seeded. */
  loading?: ReactNode;
  /** Blocking notice rendered when IndexedDB is unavailable. */
  unavailable?: (message: string) => ReactNode;
  /** Options for the composition root (tests pass a unique `dbName`, a fake clock...). */
  options?: AppServicesOptions;
  /** Already-built services (tests); skips the composition root. */
  services?: AppServices;
}

/** Opens the database once, seeds it, and exposes the services to the tree. */
export function AppServicesProvider({ children, loading = null, unavailable, options, services }: AppServicesProviderProps) {
  const [state, setState] = useState<IndexedDbGuardResult>(
    services ? { status: 'ready', services } : { status: 'checking' },
  );

  useEffect(() => {
    if (services) return undefined;
    let cancelled = false;
    let ready: AppServices | null = null;
    void createAppServices(options).then((result) => {
      if (cancelled) {
        if (result.status === 'ready') result.services.dispose();
        return;
      }
      if (result.status === 'ready') ready = result.services;
      setState(result);
    });
    return () => {
      cancelled = true;
      ready?.dispose();
    };
    // Options are read once: the services live as long as the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  if (state.status === 'checking') return <>{loading}</>;
  if (state.status === 'unavailable') return <>{unavailable ? unavailable(state.message) : null}</>;
  return <GuardContext.Provider value={state}>{children}</GuardContext.Provider>;
}

/** State of the IndexedDB guard: `checking`, `ready` (with services) or `unavailable` (with the Spanish message). */
export function useIndexedDbGuard(): IndexedDbGuardResult {
  return useContext(GuardContext);
}

/** The application services. Only valid below `AppServicesProvider` once it is ready. */
export function useServices(): AppServices {
  const guard = useContext(GuardContext);
  if (guard.status !== 'ready') throw new Error('useServices() must be used inside a ready <AppServicesProvider>');
  return guard.services;
}
