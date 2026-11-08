const STORAGE_KEY = 'privee-food-user';
export const DEFAULT_USER = 'Cocina';

/** Operator name of this tab, recorded on every event. Kept in sessionStorage (per tab). */
export interface SessionUser {
  get(): string;
  set(name: string): void;
}

export function createSessionUser(storage?: Pick<Storage, 'getItem' | 'setItem'> | null): SessionUser {
  let fallback = DEFAULT_USER;
  const resolve = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    if (storage !== undefined) return storage;
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    get() {
      try {
        return resolve()?.getItem(STORAGE_KEY)?.trim() || fallback;
      } catch {
        return fallback;
      }
    },
    set(name: string) {
      const clean = name.trim() || DEFAULT_USER;
      fallback = clean;
      try {
        resolve()?.setItem(STORAGE_KEY, clean);
      } catch {
        // Storage blocked: the in-memory name still works for this tab.
      }
    },
  };
}
