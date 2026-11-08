import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, hasSettingsErrors, SETTINGS_MESSAGES, validateSettings, type Settings } from '../settings';
import { ADMIN_KEY, checkAdminKey } from '../adminKey';

const withChange = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('DEFAULT_SETTINGS', () => {
  it('matches the briefing values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });

  it('is valid', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({});
    expect(hasSettingsErrors({})).toBe(false);
  });
});

describe('validateSettings', () => {
  it('accepts zero caps (valid per briefing) but not negative ones', () => {
    expect(validateSettings(withChange({ chickenCapG: 0 }))).toEqual({});
    expect(validateSettings(withChange({ beefCapG: -1 }))).toEqual({ beefCapG: SETTINGS_MESSAGES.outOfRange });
  });

  it('requires a positive kcal band with min below max', () => {
    expect(validateSettings(withChange({ kcalMin: 0 })).kcalMin).toBe('Valor fuera de rango');
    expect(validateSettings(withChange({ kcalMin: 600, kcalMax: 545 }))).toEqual({ kcalMin: 'Valor fuera de rango' });
    expect(validateSettings(withChange({ kcalMax: Number.NaN })).kcalMax).toBe('Valor fuera de rango');
  });

  it('validates protein and variety shares', () => {
    expect(validateSettings(withChange({ proteinMin: -1 })).proteinMin).toBeDefined();
    expect(validateSettings(withChange({ minShare: 0 })).minShare).toBeDefined();
    expect(validateSettings(withChange({ maxShare: 1.2 })).maxShare).toBeDefined();
    expect(validateSettings(withChange({ minShare: 0.4, maxShare: 0.3 })).minShare).toBeDefined();
  });

  it('validates packages', () => {
    const errors = validateSettings(
      withChange({ chickenPackage: { sizeG: 0, priceCents: -1 }, beefPackage: { sizeG: 1000, priceCents: 21900.5 } }),
    );
    expect(errors['chickenPackage.sizeG']).toBeDefined();
    expect(errors['chickenPackage.priceCents']).toBeDefined();
    expect(errors['beefPackage.priceCents']).toBeDefined();
    expect(errors['beefPackage.sizeG']).toBeUndefined();
  });

  it('validates close time and quotas', () => {
    expect(validateSettings(withChange({ closeTime: { hour: 24, minute: 0 } }))['closeTime.hour']).toBeDefined();
    expect(validateSettings(withChange({ closeTime: { hour: 11, minute: 60 } }))['closeTime.minute']).toBeDefined();
    expect(validateSettings(withChange({ closeTime: { hour: 0, minute: 0 } }))).toEqual({});
    expect(validateSettings(withChange({ weeklyPortionQuota: 0 })).weeklyPortionQuota).toBeDefined();
    expect(validateSettings(withChange({ weeklyPortionQuota: 600.5 })).weeklyPortionQuota).toBeDefined();
    expect(validateSettings(withChange({ routeQuotas: { open: -1, morning: 30, afternoon: 1.5 } }))).toEqual({
      'routeQuotas.open': 'Valor fuera de rango',
      'routeQuotas.afternoon': 'Valor fuera de rango',
    });
    expect(validateSettings(withChange({ routeChargeCents: -5 })).routeChargeCents).toBeDefined();
  });
});

describe('checkAdminKey', () => {
  it('accepts only the exact key', () => {
    expect(checkAdminKey(ADMIN_KEY)).toBe(true);
    expect(checkAdminKey('privee-cocina-2026')).toBe(true);
    expect(checkAdminKey('')).toBe(false);
    expect(checkAdminKey(` ${ADMIN_KEY}`)).toBe(false);
  });
});
