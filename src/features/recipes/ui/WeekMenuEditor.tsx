import { useState } from 'react';
import type { WeekMenu } from '@/features/planning/domain/menu';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { formatWeekLabel } from '@/shared/ui/format';
import type { RecipeEntity } from '../domain/recipe';

export const MENU_SIZE = 6;

export interface MenuDraft {
  recipeCodes: string[];
  chickenCapG: number | undefined;
  beefCapG: number | undefined;
}

const toKg = (grams: number | undefined): string => (grams === undefined ? '' : String(grams / 1000));
const toGrams = (kg: string): number | undefined => (kg.trim() === '' ? undefined : Math.round(Number(kg.replace(',', '.')) * 1000));

/** Presentational: choose the recipes of a week and its chicken / beef caps (in kg). */
export function WeekMenuEditor({
  weekId,
  menu,
  recipes,
  blockedCodes,
  defaultCaps,
  errors,
  saved,
  onSave,
}: {
  weekId: string;
  menu: WeekMenu | null;
  recipes: RecipeEntity[];
  blockedCodes: string[];
  defaultCaps: { chickenCapG: number; beefCapG: number };
  errors: Record<string, string>;
  saved: boolean;
  onSave(draft: MenuDraft): void;
}) {
  const [chosen, setChosen] = useState<string[]>(menu?.recipeCodes ?? []);
  const [chicken, setChicken] = useState(toKg(menu?.chickenCapG ?? defaultCaps.chickenCapG));
  const [beef, setBeef] = useState(toKg(menu?.beefCapG ?? defaultCaps.beefCapG));
  const toggle = (code: string) => setChosen((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  const tooMany = chosen.length > MENU_SIZE;

  return (
    <Card title={`Menú de la semana · ${formatWeekLabel(weekId)}`} data-testid="menu-editor">
      {(!menu || menu.recipeCodes.length === 0) && <EmptyState message="El menú de esta semana no tiene recetas" />}
      <p className="my-3">Elegí {MENU_SIZE} recetas. Las que se sirvieron la semana anterior quedan fuera del modelo de producción (rotación).</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <li key={recipe.code}>
            <label className="flex min-h-11 items-center gap-2 rounded border border-navy/20 px-2">
              <input type="checkbox" className="h-5 w-5" checked={chosen.includes(recipe.code)} onChange={() => toggle(recipe.code)} />
              <span>
                {recipe.code} · {recipe.name}
              </span>
              {blockedCodes.includes(recipe.code) && <Badge tone="accent">Bloqueada por rotación</Badge>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Tope de pollo (kg)" error={errors.chickenCapG}>
          {(c) => <input {...c} type="number" min={0} step="0.1" className={INPUT_CLASS} value={chicken} onChange={(e) => setChicken(e.target.value)} />}
        </Field>
        <Field label="Tope de res (kg)" error={errors.beefCapG}>
          {(c) => <input {...c} type="number" min={0} step="0.1" className={INPUT_CLASS} value={beef} onChange={(e) => setBeef(e.target.value)} />}
        </Field>
      </div>
      <p className="mt-3 tabular font-semibold">
        {chosen.length} de {MENU_SIZE} recetas elegidas
      </p>
      {errors.recipeCodes && (
        <Notice tone="warning" className="mt-2">
          {errors.recipeCodes}
        </Notice>
      )}
      {tooMany && !errors.recipeCodes && <p className="text-error">Elegiste más de {MENU_SIZE} recetas.</p>}
      {saved && (
        <Notice tone="ok" className="mt-2">
          Menú guardado. El plan de la semana queda desactualizado hasta que lo recalcules.
        </Notice>
      )}
      <Button className="mt-3" variant="primary" onClick={() => onSave({ recipeCodes: chosen, chickenCapG: toGrams(chicken), beefCapG: toGrams(beef) })}>
        Guardar menú
      </Button>
    </Card>
  );
}
