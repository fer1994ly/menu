import { setPath } from '@/features/history/domain/diff';
import type { Settings } from '../domain/settings';

export interface SettingsFieldDef {
  /** Dotted path into `Settings`; also the key of the validation error. */
  path: string;
  label: string;
  /** Stored value = shown value × scale (kg → g is 1000, % → share is 0.01, $ → cents is 100). */
  scale: number;
  step: string;
  group: string;
}

export const SETTINGS_FIELDS: readonly SettingsFieldDef[] = [
  { group: 'Topes semanales (si el menú no define los suyos)', path: 'chickenCapG', label: 'Tope de pollo (kg)', scale: 1000, step: '0.1' },
  { group: 'Topes semanales (si el menú no define los suyos)', path: 'beefCapG', label: 'Tope de res (kg)', scale: 1000, step: '0.1' },
  { group: 'Nutrición', path: 'kcalMin', label: 'Kcal promedio mínimo', scale: 1, step: '1' },
  { group: 'Nutrición', path: 'kcalMax', label: 'Kcal promedio máximo', scale: 1, step: '1' },
  { group: 'Nutrición', path: 'proteinMin', label: 'Proteína promedio mínima (g)', scale: 1, step: '0.1' },
  { group: 'Variedad', path: 'minShare', label: 'Mínimo por receta (% de D)', scale: 0.01, step: '1' },
  { group: 'Variedad', path: 'maxShare', label: 'Máximo por receta (% de D)', scale: 0.01, step: '1' },
  { group: 'Paquetes y precios', path: 'chickenPackage.sizeG', label: 'Tamaño del paquete de pollo (g)', scale: 1, step: '1' },
  { group: 'Paquetes y precios', path: 'chickenPackage.priceCents', label: 'Precio del paquete de pollo ($)', scale: 100, step: '0.01' },
  { group: 'Paquetes y precios', path: 'beefPackage.sizeG', label: 'Tamaño del paquete de res (g)', scale: 1, step: '1' },
  { group: 'Paquetes y precios', path: 'beefPackage.priceCents', label: 'Precio del paquete de res ($)', scale: 100, step: '0.01' },
  { group: 'Cierre y cupos', path: 'closeTime.hour', label: 'Hora de cierre del sábado', scale: 1, step: '1' },
  { group: 'Cierre y cupos', path: 'closeTime.minute', label: 'Minuto de cierre del sábado', scale: 1, step: '1' },
  { group: 'Cierre y cupos', path: 'weeklyPortionQuota', label: 'Cupo semanal (porciones)', scale: 1, step: '1' },
  { group: 'Rutas del domingo', path: 'routeQuotas.open', label: 'Cupo de la ruta abierta', scale: 1, step: '1' },
  { group: 'Rutas del domingo', path: 'routeQuotas.morning', label: 'Cupo de la ruta de mañana', scale: 1, step: '1' },
  { group: 'Rutas del domingo', path: 'routeQuotas.afternoon', label: 'Cupo de la ruta de tarde', scale: 1, step: '1' },
  { group: 'Rutas del domingo', path: 'routeChargeCents', label: 'Cargo de ruta de mañana y tarde ($)', scale: 100, step: '0.01' },
];

export function getPath(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], target);
}

/** Text shown in the input for a stored value. */
export function toFieldText(settings: Settings, field: SettingsFieldDef): string {
  const value = getPath(settings, field.path) as number;
  return String(Number((value / field.scale).toFixed(4)));
}

/** Stored value for the text typed; NaN when it is not a number (the validator reports it). */
export function fromFieldText(text: string, field: SettingsFieldDef): number {
  if (text.trim() === '') return Number.NaN;
  const raw = Number(text.replace(',', '.'));
  return Math.round(raw * field.scale * 1e6) / 1e6;
}

export function buildSettings(base: Settings, texts: Readonly<Record<string, string>>): Settings {
  return SETTINGS_FIELDS.reduce<Settings>((settings, field) => setPath(settings, field.path, fromFieldText(texts[field.path] ?? '', field)), base);
}

export function initialTexts(settings: Settings): Record<string, string> {
  return Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.path, toFieldText(settings, field)]));
}
