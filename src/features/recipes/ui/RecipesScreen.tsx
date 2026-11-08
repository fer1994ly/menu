import { useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import type { WeekMenu } from '@/features/planning/domain/menu';
import { previousWeekId } from '@/shared/kernel/time';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Notice } from '@/shared/ui/Notice';
import { WeekSelect } from '@/shared/ui/WeekSelect';
import { useLiveData } from '@/shared/ui/liveData';
import { useWeek } from '@/shared/ui/weekContext';
import type { RecipeEntity, RecipeErrors } from '../domain/recipe';
import { RecipeCard } from './RecipeCard';
import { RecipeForm } from './RecipeForm';
import { MENU_SIZE, WeekMenuEditor, type MenuDraft } from './WeekMenuEditor';

function useRecipesData(weekId: string) {
  const { repos } = useServices();
  return useLiveData(async () => {
    const [recipes, menu, previous, settings] = await Promise.all([
      repos.recipes.list(),
      repos.menus.get(weekId),
      repos.menus.get(previousWeekId(weekId)),
      repos.settings.get(),
    ]);
    recipes.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
    return {
      recipes,
      menu: menu ?? null,
      blockedCodes: previous?.recipeCodes ?? [],
      defaultCaps: { chickenCapG: settings.chickenCapG, beefCapG: settings.beefCapG },
    };
  }, [weekId]);
}

export function RecipesScreen() {
  const { changes } = useServices();
  const { weekId } = useWeek();
  const { data, error } = useRecipesData(weekId);
  const [form, setForm] = useState<{ recipe: RecipeEntity | null } | null>(null);
  const [formErrors, setFormErrors] = useState<RecipeErrors>({});
  const [busy, setBusy] = useState(false);
  const [menuErrors, setMenuErrors] = useState<Record<string, string>>({});
  const [menuSaved, setMenuSaved] = useState(false);

  const submitRecipe = async (recipe: RecipeEntity) => {
    if (!form?.recipe && data?.recipes.some((r) => r.code === recipe.code)) {
      setFormErrors({ code: 'Ese código ya existe' });
      return;
    }
    setBusy(true);
    try {
      const result = await changes.saveRecipe(recipe);
      if (result.ok) {
        setFormErrors({});
        setForm(null);
      } else {
        setFormErrors(result.errors);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveMenu = async (draft: MenuDraft) => {
    setMenuSaved(false);
    if (draft.recipeCodes.length !== MENU_SIZE) {
      setMenuErrors({ recipeCodes: `Elegí ${MENU_SIZE} recetas para el menú (hay ${draft.recipeCodes.length} elegidas)` });
      return;
    }
    const menu: WeekMenu = {
      weekId,
      recipeCodes: draft.recipeCodes,
      ...(draft.chickenCapG === undefined ? {} : { chickenCapG: draft.chickenCapG }),
      ...(draft.beefCapG === undefined ? {} : { beefCapG: draft.beefCapG }),
    };
    const result = await changes.saveMenu(menu);
    setMenuErrors(result.ok ? {} : result.errors);
    setMenuSaved(result.ok);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Recetas</h2>
        <Button
          variant="primary"
          onClick={() => {
            setFormErrors({});
            setForm({ recipe: null });
          }}
        >
          Nueva receta
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      {form && (
        <RecipeForm
          key={form.recipe?.code ?? 'new'}
          recipe={form.recipe}
          errors={formErrors}
          busy={busy}
          onSubmit={(recipe) => void submitRecipe(recipe)}
          onCancel={() => setForm(null)}
        />
      )}

      {data && data.recipes.length === 0 && <EmptyState message="Todavía no hay recetas" />}
      {data && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.recipes.map((recipe) => (
            <li key={recipe.code}>
              <RecipeCard
                recipe={recipe}
                blocked={data.blockedCodes.includes(recipe.code)}
                onEdit={(r) => {
                  setFormErrors({});
                  setForm({ recipe: r });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <WeekSelect className="max-w-xs" />
      {data && (
        <WeekMenuEditor
          key={`${weekId}:${JSON.stringify(data.menu)}`}
          weekId={weekId}
          menu={data.menu}
          recipes={data.recipes}
          blockedCodes={data.blockedCodes}
          defaultCaps={data.defaultCaps}
          errors={menuErrors}
          saved={menuSaved}
          onSave={(draft) => void saveMenu(draft)}
        />
      )}
    </div>
  );
}
