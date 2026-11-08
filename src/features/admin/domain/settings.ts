import type { CloseTime } from '@/shared/kernel/time';
import type { RouteQuotas } from '@/features/routes/domain/routes';

export interface PackageSettings {
  /** Package size in grams. */
  sizeG: number;
  /** Price per package in cents. */
  priceCents: number;
}

/** Everything the admin panel can edit. Money is stored in integer cents. */
export interface Settings {
  chickenCapG: number;
  beefCapG: number;
  kcalMin: number;
  kcalMax: number;
  proteinMin: number;
  /** Minimum share of D per active recipe (0.10 = 10 %). */
  minShare: number;
  maxShare: number;
  chickenPackage: PackageSettings;
  beefPackage: PackageSettings;
  /** Saturday close time (local Monterrey). */
  closeTime: CloseTime;
  weeklyPortionQuota: number;
  routeQuotas: RouteQuotas;
  /** Surcharge of the morning and afternoon routes, in cents. */
  routeChargeCents: number;
}

export const DEFAULT_SETTINGS: Settings = {
  chickenCapG: 26000,
  beefCapG: 20000,
  kcalMin: 480,
  kcalMax: 545,
  proteinMin: 37,
  minShare: 0.1,
  maxShare: 0.3,
  chickenPackage: { sizeG: 2000, priceCents: 29800 },
  beefPackage: { sizeG: 1000, priceCents: 21900 },
  closeTime: { hour: 11, minute: 30 },
  weeklyPortionQuota: 600,
  routeQuotas: { open: 90, morning: 30, afternoon: 30 },
  routeChargeCents: 9900,
};

export const SETTINGS_MESSAGES = { outOfRange: 'Valor fuera de rango' } as const;

/** Field errors keyed by dotted path (`closeTime.hour`); empty means valid. */
export type SettingsErrors = Record<string, string>;

const finite = (v: number): boolean => Number.isFinite(v);
const nonNegative = (v: number): boolean => finite(v) && v >= 0;
const positive = (v: number): boolean => finite(v) && v > 0;
const nonNegativeInt = (v: number): boolean => Number.isInteger(v) && v >= 0;
const positiveInt = (v: number): boolean => Number.isInteger(v) && v > 0;

export function validateSettings(settings: Settings): SettingsErrors {
  const errors: SettingsErrors = {};
  const check = (path: string, ok: boolean): void => {
    if (!ok) errors[path] = SETTINGS_MESSAGES.outOfRange;
  };

  // Caps may be 0 (valid per briefing).
  check('chickenCapG', nonNegative(settings.chickenCapG));
  check('beefCapG', nonNegative(settings.beefCapG));
  check('kcalMin', positive(settings.kcalMin) && (!positive(settings.kcalMax) || settings.kcalMin <= settings.kcalMax));
  check('kcalMax', positive(settings.kcalMax));
  check('proteinMin', nonNegative(settings.proteinMin));
  check(
    'minShare',
    finite(settings.minShare) && settings.minShare > 0 && settings.minShare <= 1 && settings.minShare <= settings.maxShare,
  );
  check('maxShare', finite(settings.maxShare) && settings.maxShare > 0 && settings.maxShare <= 1);

  for (const key of ['chickenPackage', 'beefPackage'] as const) {
    check(`${key}.sizeG`, positive(settings[key].sizeG));
    check(`${key}.priceCents`, nonNegativeInt(settings[key].priceCents));
  }

  check('closeTime.hour', Number.isInteger(settings.closeTime.hour) && settings.closeTime.hour >= 0 && settings.closeTime.hour <= 23);
  check('closeTime.minute', Number.isInteger(settings.closeTime.minute) && settings.closeTime.minute >= 0 && settings.closeTime.minute <= 59);

  check('weeklyPortionQuota', positiveInt(settings.weeklyPortionQuota));
  for (const route of ['open', 'morning', 'afternoon'] as const) {
    check(`routeQuotas.${route}`, nonNegativeInt(settings.routeQuotas[route]));
  }
  check('routeChargeCents', nonNegativeInt(settings.routeChargeCents));
  return errors;
}

export const hasSettingsErrors = (errors: SettingsErrors): boolean => Object.keys(errors).length > 0;
