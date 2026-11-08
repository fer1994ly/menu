import { createContext, useContext, useEffect, useRef, useState } from 'react';

/** Counter that grows whenever stored data changed (local change, another tab, restore). */
export const DataVersionContext = createContext<number>(0);
export const ReloadContext = createContext<() => void>(() => undefined);

export const useDataVersion = (): number => useContext(DataVersionContext);
export const useReload = (): (() => void) => useContext(ReloadContext);

export interface LiveData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads data and reloads it when the data version or `deps` change. Previous data
 * stays on screen while reloading (no flicker); `loading` is true only the first time.
 */
export function useLiveData<T>(loader: () => Promise<T>, deps: readonly unknown[]): LiveData<T> {
  const version = useDataVersion();
  const key = JSON.stringify(deps);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key, data: null, error: error instanceof Error ? error.message : 'Error al leer los datos' });
      });
    return () => {
      cancelled = true;
    };
  }, [version, key]);

  const current = state.key === key ? state : { key, data: null, error: null };
  return { data: current.data, error: current.error, loading: current.data === null && current.error === null };
}
