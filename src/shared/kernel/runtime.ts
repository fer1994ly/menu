/** Injected collaborators so services stay deterministic in tests. */
export type Clock = () => number;
export type IdFactory = () => string;

export const systemClock: Clock = () => Date.now();

let fallbackCounter = 0;

/** Unique id: `crypto.randomUUID` when available, otherwise a time + counter + random string. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
