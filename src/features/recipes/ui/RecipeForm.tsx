import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import type { RecipeEntity, RecipeErrors } from '../domain/recipe';

interface FormState {
  code: string;
  name: string;
  kcal: string;
  protein: string;
  cost: string;
  chickenG: string;
  beefG: string;
  glutenFree: boolean;
  active: boolean;
}

const toState = (recipe: RecipeEntity | null): FormState => ({
  code: recipe?.code ?? '',
  name: recipe?.name ?? '',
  kcal: recipe ? String(recipe.kcal) : '',
  protein: recipe ? String(recipe.protein) : '',
  cost: recipe ? String(recipe.cost) : '',
  chickenG: recipe ? String(recipe.chickenG) : '0',
  beefG: recipe ? String(recipe.beefG) : '0',
  glutenFree: recipe?.glutenFree ?? false,
  active: recipe?.active ?? true,
});

/** Empty text is NaN so it is reported as out of range instead of silently becoming 0. */
const num = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text.replace(',', '.')));

export function formToRecipe(state: FormState, base: RecipeEntity | null): RecipeEntity {
  return {
    ...(base ?? {}),
    code: state.code.trim(),
    name: state.name.trim(),
    kcal: num(state.kcal),
    protein: num(state.protein),
    cost: num(state.cost),
    chickenG: num(state.chickenG),
    beefG: num(state.beefG),
    glutenFree: state.glutenFree,
    active: state.active,
  };
}

const NUMBER_FIELDS = [
  ['kcal', 'Kcal'],
  ['protein', 'Proteína (g)'],
  ['cost', 'Costo por porción'],
  ['chickenG', 'Gramos de pollo'],
  ['beefG', 'Gramos de res'],
] as const;

/** Presentational form: validation errors come from the change service, per field. */
export function RecipeForm({
  recipe,
  errors,
  busy,
  onSubmit,
  onCancel,
}: {
  recipe: RecipeEntity | null;
  errors: RecipeErrors;
  busy: boolean;
  onSubmit(recipe: RecipeEntity): void;
  onCancel(): void;
}) {
  const [state, setState] = useState<FormState>(() => toState(recipe));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));
  return (
    <Card title={recipe ? `Editar ${recipe.code}` : 'Nueva receta'} data-testid="recipe-form">
      <form
        className="grid gap-3 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(formToRecipe(state, recipe));
        }}
      >
        <Field label="Código" error={errors.code}>
          {(c) => <input {...c} className={INPUT_CLASS} value={state.code} disabled={recipe !== null} onChange={(e) => set('code', e.target.value)} />}
        </Field>
        <Field label="Nombre" error={errors.name}>
          {(c) => <input {...c} className={INPUT_CLASS} value={state.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        {NUMBER_FIELDS.map(([key, label]) => (
          <Field key={key} label={label} error={errors[key]}>
            {(c) => <input {...c} inputMode="decimal" className={INPUT_CLASS} value={state[key]} onChange={(e) => set(key, e.target.value)} />}
          </Field>
        ))}
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={state.glutenFree} onChange={(e) => set('glutenFree', e.target.checked)} />
          Sin gluten
        </label>
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={state.active} onChange={(e) => set('active', e.target.checked)} />
          Activa (entra al modelo de producción)
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            Guardar receta
          </Button>
          <Button onClick={onCancel}>Cerrar</Button>
        </div>
      </form>
    </Card>
  );
}
