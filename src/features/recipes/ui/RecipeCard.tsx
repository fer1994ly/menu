import { formatDecimal, formatGrams, formatMoney } from '@/shared/kernel/numberFormat';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { formatWeekLabel } from '@/shared/ui/format';
import type { RecipeEntity } from '../domain/recipe';

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-navy/70">{label}</dt>
      <dd className="tabular font-heading text-xl font-bold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/** Presentational recipe card («ficha»). */
export function RecipeCard({ recipe, blocked, onEdit }: { recipe: RecipeEntity; blocked: boolean; onEdit(recipe: RecipeEntity): void }) {
  const id = `recipe-${recipe.code}`;
  return (
    <article data-testid={id} className={`flex flex-col gap-3 rounded border border-navy/20 p-4 ${recipe.active ? '' : 'bg-neutral/60'}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="tabular text-sm font-semibold text-navy/70">{recipe.code}</p>
          <h3 className="text-lg font-bold leading-tight">{recipe.name}</h3>
        </div>
        <span className="flex flex-col items-end gap-1">
          {recipe.glutenFree && <Badge tone="ok">Sin gluten</Badge>}
          {!recipe.active && <Badge tone="warning">Inactiva</Badge>}
          {blocked && <Badge tone="accent">Servida la semana pasada</Badge>}
        </span>
      </header>
      <dl className="grid grid-cols-3 gap-2">
        <Figure label="Kcal" value={formatDecimal(recipe.kcal, 0)} testId={`${id}-kcal`} />
        <Figure label="Proteína (g)" value={formatDecimal(recipe.protein, 0)} testId={`${id}-protein`} />
        <Figure label="Costo" value={formatMoney(recipe.cost)} testId={`${id}-cost`} />
        <Figure label="Pollo" value={formatGrams(recipe.chickenG)} testId={`${id}-chicken`} />
        <Figure label="Res" value={formatGrams(recipe.beefG)} testId={`${id}-beef`} />
      </dl>
      <p className="text-sm">Última semana servida: {recipe.lastServedWeek ? formatWeekLabel(recipe.lastServedWeek) : 'sin registro'}</p>
      <Button aria-label={`Editar ${recipe.code}`} onClick={() => onEdit(recipe)}>
        Editar
      </Button>
    </article>
  );
}
