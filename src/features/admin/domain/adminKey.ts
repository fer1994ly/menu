/**
 * Key that unlocks the /admin screen.
 *
 * WARNING: this is NOT real authentication. The key ships inside the client
 * bundle, so anyone can read it. It only prevents accidental edits of the
 * kitchen settings. A real deployment needs server-side auth.
 */
export const ADMIN_KEY = 'privee-cocina-2026';

export function checkAdminKey(candidate: string): boolean {
  return candidate === ADMIN_KEY;
}
