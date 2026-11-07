# Briefing — Privee Food · Menú semanal en lote al costo mínimo

> Source of truth for business rules, exact test cases and exact UI messages.
> UI copy is Spanish (voseo). Code, identifiers and docs are English.

## Visual identity
Palette: `#14213D` (navy, base), `#FCA311` (accent, actionable), `#E5E5E5` (neutral), `#FFFFFF`, `#2A9D8F` (ok), `#9B2226` (error/warning).
Typography: Space Grotesk (headings) · IBM Plex Sans (body, tabular numbers).
Tone: production tool, direct, big aligned numbers, no ornaments, no dish photos, no delivery-app aesthetic. Simple language, voseo, warnings state exactly what happened and how much.

## Model (two-phase simplex written in TypeScript, no optimization libraries)
- Variables: `x_r` = portions to produce of recipe r. `D` = total portions of closed orders (plan 5 = 5 portions, plan 10 = 10).
- `Σ x_r = D`.
- Each active recipe between 10 % and 30 % of D.
- Average kcal per portion between 480 and 545: `480·D ≤ Σ kcal_r·x_r ≤ 545·D`.
- Average protein ≥ 37 g: `Σ prot_r·x_r ≥ 37·D`.
- Chicken `Σ g_chicken_r·x_r ≤ chicken cap (g)`; beef likewise.
- Gluten-free `Σ x_r (gluten-free recipes) ≥ G`, G = portions of orders flagged gluten-free.
- Rotation: a recipe served the previous week is out of the model (and out of the 10 % minimum).
- Objective: minimize cost. Tie-break: at equal cost, maximize total protein (second model with cost = optimum). If still tied, any solution with that cost and protein is accepted. Bland's rule, tolerance 1e-9.
- No solution: «No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.»

## Rounding (largest remainder)
Round each x_r to 6 decimals, take integer part, R = D − Σ integer parts, add 1 portion to the R recipes with the largest fractional part (fraction rounded to 6 decimals). Tie: lower recipe code wins (R1 before R2).

## Post-rounding verification (with integer portions)
Recompute cost, avg kcal and avg protein (2 decimals half-up) and cap usage. If something breaks, show a non-blocking warning ABOVE the plan (never in a tooltip):
- «Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g»
- «Las porciones enteras superan el tope de pollo en 40 g»
- same format for kcal and beef (e.g. «Kcal promedio 546,10: queda por encima del máximo de 545», «Kcal promedio 479,50: queda por debajo del mínimo de 480», «Las porciones enteras superan el tope de res en 15 g»).

## Shopping
grams per input = Σ g_r × integer portions; packages = ceil(grams / package size); cost = packages × price; leftover = packages × size − grams.
Chicken: 2.000 g packages at $298,00. Beef: 1.000 g packages at $219,00. CSV export.

## Architecture
IndexedDB (localStorage can't hold the volume), virtualized tables, calculation in a Web Worker, Vitest ≥ 80 % engine coverage.
Every change is an immutable event (user, date-time, entity, field, old value, new value), undo/redo 50 steps, «estado al…» view replaying events from weekly snapshots.
Two tabs sync with BroadcastChannel. Conflict rule: if two tabs edit the same order before close, last saved wins; if any edit is saved after Saturday 11:30, the version saved before close wins (production was already calculated with it). In both cases show a notice with both values, allow choosing the other (if the close allows), and log everything in history.
Nutritional values and targets are configurable sample data to be validated by a nutrition professional.

## Sample catalog — test recipes (per portion: kcal, protein g, cost MXN, g chicken, g beef, gluten-free)
| Code | Name | kcal | prot | cost | chicken | beef | GF |
|---|---|---|---|---|---|---|---|
| R1 | Pollo a la mostaza con arroz | 520 | 42 | 48.50 | 180 | 0 | yes |
| R2 | Picadillo de res con verduras | 480 | 35 | 56.00 | 0 | 160 | yes |
| R3 | Pasta integral a la boloñesa | 610 | 33 | 41.00 | 0 | 110 | no |
| R4 | Tinga de pollo con frijoles | 550 | 38 | 39.50 | 140 | 0 | yes |
| R5 | Salmón teriyaki con quinoa | 500 | 34 | 89.00 | 0 | 0 | no |
| R6 | Enchiladas verdes de pollo | 590 | 36 | 37.00 | 120 | 0 | yes |

Extended recipe book for the seed: 60 more recipes, northern Mexican and healthy cuisine (machacado con huevo y nopales, discada ligera, arrachera con calabacitas, pescado zarandeado, bowl de pollo al chipotle, plus realistic names), kcal 380–680, protein 22–48, cost 32–95, chicken or beef grams 0–200. Each history week uses 6 recipes, none repeated from the previous week.

## Orders, close and quotas
Week orders are received Sunday to Saturday and close Saturday 11:30 Monterrey time (America/Monterrey, UTC−6, no DST).
Kitchen produces at most 600 portions/week: quota resets every Sunday after delivery, decreases with each confirmed order (5 or 10), an order that doesn't fit whole moves to next week.
Sunday routes: open 8:00–17:00 free (quota 90 deliveries), morning 8:00–12:00 $99 (quota 30), afternoon 13:00–17:00 $99 (quota 30). If chosen route is full → open route with notice; if open is full too → next week. Cancel returns quota. Everything resets each Sunday.

## Big seed (fixed seed, mulberry32 seed 2604)
2.000 clients, 26.000 orders in 52 weeks (380–620 per week, plan 5 70 % / plan 10 30 %, gluten-free 6 %, open route 65 %, morning 20 %, afternoon 15 %), weekly chicken caps 20–40 kg and beef 12–25 kg, and the production plan of each week calculated.

## Mandatory test cases (all use the 6 test recipes; values 2 decimals half-up)
1. **Normal week with fraction tie**: D = 300 (40 plans of 5 + 10 of 10), chicken cap 26 kg, beef 20 kg, G = 25. Continuous: R1 79,07, R2 38,33, R3 64,26, R4 58,33, R5 30,00, R6 30,00, cost $14.700,56. Integer parts 79, 38, 64, 58, 30, 30 (sum 299, R = 1). R2 and R4 tie at 0,333333: extra goes to R2. Integers: R1 79, R2 39, R3 64, R4 58, R5 30, R6 30. Cost $14.710,50, avg kcal 544,80, avg protein 37,00. Shopping: chicken 25.940 g, 13 packages, $3.874,00, leftover 60 g; beef 13.280 g, 14 packages, $3.066,00, leftover 720 g. No warnings.
2. **Rounding trap that breaks an average**: D = 155 (11 plans of 5 + 10 of 10), chicken 13 kg, beef 20 kg, G = 25. Continuous: R1 46,17, R2 20,71, R3 36,91, R4 20,21, R5 15,50, R6 15,50, cost $7.663,60. Integer parts 46, 20, 36, 20, 15, 15 (R = 3). Fraction order: R3 (0,912037), R2 (0,708333), R5 and R6 tie at 0,5: third portion to R5. Integers: R1 46, R2 21, R3 37, R4 20, R5 16, R6 15. Cost $7.693,00, avg kcal 544,65, avg protein 36,98: exact warning «Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g». Shopping: chicken 12.880 g, 7 packages, $2.086,00, leftover 1.120 g; beef 7.430 g, 8 packages, $1.752,00, leftover 570 g.
3. **No-solution trap**: D = 300, chicken 10 kg, beef 20 kg, G = 25. No plan: show exactly «No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.», no shopping list, previous plan of the week (if any) is kept.
4. **Rotation and cap broken by rounding**: D = 300, R4 blocked (served previous week), chicken 26 kg, beef 20 kg, G = 180. Continuous: R1 90,00, R2 57,50, R3 40,83, R5 30,00, R6 81,67, cost $14.950,83. Integer parts 90, 57, 40, 30, 81 (R = 2): first to R3 (0,833333), second to R6 (0,666667); R2 (0,5) no extra. Integers: R1 90, R2 57, R3 41, R5 30, R6 82. Cost $14.942,00, avg kcal 541,83, avg protein 37,00. Chicken 26.040 g: exact warning «Las porciones enteras superan el tope de pollo en 40 g». Shopping: chicken 14 packages, $4.172,00, leftover 1.960 g; beef 13.630 g, 14 packages, $3.066,00, leftover 370 g.

## Edge cases
- D = 0: model not run, show «Todavía no hay pedidos cerrados para esta semana».
- Fewer than 4 active recipes: max possible 3 × 30 % = 90 % of D → no-solution message instantly, without running simplex.
- Chicken or beef cap 0: valid; recipes using that input only if their grams are 0.
- Recipe with cost ≤ 0, kcal 0 or negative grams: not saved, field marked «Valor fuera de rango».
- G > D: calculation rejected with «Hay más porciones sin gluten que porciones totales: revisá los pedidos».
- Order at exactly Saturday 11:30:00 enters current week; at 11:30:01 goes to next.
- 10-portion order with only 5 free in weekly quota: not split, moves whole to next week.
- Continuous solution already integer: R = 0, nothing distributed.
- Fractions 0,3333333 and 0,3333334: tie after rounding to 6 decimals, code decides.
- Grams exact multiple of package (26.000 g chicken): 13 packages leftover 0, not 14.
- Recipe price change after plan calculated: plan marked «desactualizado» until recalculated; event logs it.
- Undo beyond 50 steps: button disabled with notice.
- «Estado al…» before first event: initial seed state with notice «Antes del primer registro».
- Morning and open routes full: order moves to next week, notice states next Sunday's date.

## Scope (screens)
Home (current week, orders received, total portions, countdown to Saturday 11:30, plan status, «Calcular producción» visible without scroll on mobile) · Orders (virtualized table, search by client or code, filters plan/route/gluten-free/week, create form that rejects after close and moves to next week with notice) · Recipes (card: kcal, protein, cost, chicken g, beef g, gluten-free, last served week, validations) · Production plan (builds LP, solves in Web Worker, continuous + integer solution, both costs, avg kcal/protein, cap usage, post-rounding warnings with exact text) · Calculation explanation (initial tableau, pivots of both phases, final tableau, largest-remainder table: fraction, order, who got the extra) · Shopping list (grams, packages, cost, leftover, CSV) · Sunday routes (quotas, auto move to open) · History & «estado al…» (filter by order/recipe/user, undo/redo 50, reconstruction at past datetime) · /admin (simple key in code — NOT real auth, say so in README; caps, kcal band, min protein, variety %, packages & prices, close time, route quotas) · Empty states & errors (no orders, no recipes, blocking notice if IndexedDB unavailable), mobile-first 360 px · «Restaurar datos de ejemplo» in settings (wipe IndexedDB and regenerate seed).

## Acceptance criteria (review is done against this list)
1. The 4 test cases give exactly the indicated results, as passing automated tests.
2. Engine (model, simplex, rounding, shopping) coverage ≥ 80 %, `npm test` runs the whole suite.
3. Simplex written in the project without optimization libraries; explanation shows the real pivots.
4. Largest remainder always distributes exactly the requested portions; on equal fractions, the extra goes to the lower recipe code.
5. If the integer solution breaks a cap or an average, the plan shows the warning with the exact briefing text and value.
6. Calculating a 600-portion week and recalculating the 52 historical seed weeks finishes in < 4 s on a mid-range laptop, in a Web Worker without freezing the UI.
7. An order loaded Saturday 11:31 lands in next week and the current week plan doesn't change.
8. Undo/redo work up to 50 steps, including recipe and cap changes.
9. «Estado al…» at Saturday 11:00 shows the plan before orders that entered between 11:00 and close, and the portions that would have been cooked.
10. If two tabs edit the same order, the conflict rule applies, notice shows both values, conflict is in history.
11. All screens work on a 360 px phone and the home main button is visible without scroll.
