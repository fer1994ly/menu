# Privee Food · Planificador de producción semanal

Aplicación web (React + TypeScript + Tailwind) para planificar la producción semanal de una cocina de comidas preparadas. A partir de los pedidos cerrados cada sábado calcula el **plan de producción de costo mínimo** con un símplex de dos fases escrito en el propio proyecto (sin librerías de optimización), reparte las porciones enteras por mayor resto, verifica el resultado ya redondeado y arma la **lista de compras por empaque**. Además gestiona pedidos, recetas, rutas del domingo, historial con «Estado al…», deshacer/rehacer y sincronización entre pestañas.

- Vista previa: <https://menuempauqe.netlify.app>
- Especificación de origen: [`docs/BRIEFING.md`](docs/BRIEFING.md) (fuente de verdad de las reglas)
- Todo corre en el navegador: no hay backend ni servicios externos.

## Verificación rápida para revisores

Abrí <https://menuempauqe.netlify.app>. La primera vez la app genera los datos de ejemplo (2.000 clientes, 26.000 pedidos, 52 semanas) y puede tardar unos segundos. La semana actual de los datos de ejemplo es el **escenario del caso 1** del briefing.

| # | Criterio de aceptación | Cómo verlo en la app | Test automático |
|---|---|---|---|
| 1 | Los 4 casos de prueba dan exactamente lo indicado | Inicio → **Calcular producción** → Plan: 79 / 39 / 64 / 58 / 30 / 30, costo `$14.710,50`, kcal `544,80`, proteína `37,00` (caso 1). Los casos 2, 3 y 4 se reproducen desde la UI (ver abajo). | `src/features/planning/domain/__tests__/briefingCases.test.ts` (los 4 casos) · `e2e/ac01-ac05-briefing-cases.spec.ts` (los 4 casos por la UI) |
| 2 | Cobertura del motor ≥ 80 % y `npm test` corre todo | — | `npm test` · `npm run test:coverage` (umbral 80 % en `vite.config.ts`; informe en `coverage/index.html`) |
| 3 | Símplex propio y explicación con los pivotes reales | Plan → **Cómo se calculó**: tabla inicial, pivotes de la fase 1 y de la fase 2 (desplegables), tabla final y tabla de redondeo (R2 recibe `+1`) | `src/features/planning/domain/__tests__/simplex.test.ts` · `e2e/ac03-explanation.spec.ts` |
| 4 | Mayor resto reparte exacto; en empate gana el código menor | Plan → Cómo se calculó → tabla «Redondeo por mayor resto» (R2 y R4 empatan en 0,333333; el extra va a R2) | `src/features/planning/domain/__tests__/largestRemainder.test.ts` · `e2e/ac03-explanation.spec.ts` |
| 5 | Si el redondeo rompe un tope o un promedio, advertencia con el texto exacto | Reproducir el caso 2 o el 4 (ver «Reproducir los casos 2, 3 y 4» más abajo). La advertencia aparece **arriba** del plan, en `plan-warnings`, nunca en un tooltip | `src/features/planning/domain/__tests__/verification.test.ts` · `e2e/ac01-ac05-briefing-cases.spec.ts` (casos 2 y 4) |
| 6 | Semana de 600 porciones + 52 semanas en < 4 s, en un Web Worker sin congelar la UI | Plan → **Recalcular las 52 semanas**: aparece «52 semanas recalculadas en N ms» y la pantalla sigue respondiendo (podés escribir en «Operador» mientras corre) | `src/features/planning/application/__tests__/performance.test.ts` · `e2e/ac06-recalculate-52-weeks.spec.ts` |
| 7 | Un pedido cargado el sábado 11:31 cae en la semana siguiente y no cambia el plan actual | Se prueba con reloj controlado (el reloj del navegador no se puede adelantar a mano): ver el test | `src/app/__tests__/integration.test.ts` · `e2e/ac07-late-order.spec.ts` |
| 8 | Deshacer/rehacer hasta 50 pasos, incluidos receta y topes | Recetas → Editar una receta y guardar; Más → Admin (clave `privee-cocina-2026`) → cambiar un tope y guardar; botones **Deshacer** / **Rehacer** del encabezado. Con la pila vacía muestran «No hay más pasos para deshacer (máximo 50)» | `src/features/history/__tests__/changeService.test.ts` · `src/app/__tests__/integration.test.ts` (50 pasos + el 51 deshabilitado) · `e2e/ac08-undo-redo.spec.ts` |
| 9 | «Estado al…» del sábado 11:00 muestra el plan previo a los pedidos tardíos y las porciones que se habrían cocinado | Más → Historial → «Estado al…» → elegir una semana → **Sábado 11:00 de la semana elegida** (tabla de porciones, pedidos y D). Comparar con la misma semana a las 11:30 | `src/app/__tests__/integration.test.ts` · `e2e/ac09-state-at.spec.ts` |
| 10 | Dos pestañas editan el mismo pedido: regla de conflicto, aviso con ambos valores, registro en el historial | Abrir la app en dos pestañas → Pedidos → **Editar** el mismo pedido en ambas → guardar primero en una y luego en la otra → aviso de conflicto (con **Elegir el otro valor**) y marca en Historial | `src/features/history/__tests__/orderConflict.test.ts` · `src/features/orders/domain/__tests__/conflict.test.ts` · `e2e/ac10-two-tabs-conflict.spec.ts` |
| 11 | Todas las pantallas funcionan a 360 px y el botón principal se ve sin hacer scroll | DevTools a 360 px de ancho: Inicio muestra **Calcular producción** sin desplazarse; ninguna pantalla tiene scroll horizontal | `e2e/ac11-mobile-layout.spec.ts` (proyecto `mobile-360`, 360 × 740, y `desktop`) |

**Reproducir los casos 2, 3 y 4 desde la UI** (son los que hacen falta para los criterios 1 y 5):

- *Caso 2 (trampa de redondeo, advertencia de proteína).* Pedidos → filtros «Plan 5» y «Con gluten» → **Cancelar** 29 pedidos (quedan 155 porciones totales y 25 sin gluten) → Más → Recetas → «Tope de pollo (kg)» = `13` → **Guardar menú** → Inicio → **Calcular producción**. Resultado: 46 / 21 / 37 / 20 / 16 / 15, costo `$7.693,00`, y arriba del plan «Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g».
- *Caso 3 (sin solución).* Más → Recetas → «Tope de pollo (kg)» = `10` → **Guardar menú** → Inicio → **Calcular producción**. Aparece exactamente «No hay plan de producción posible con estos topes. Revisá el tope de pollo, el de res o las porciones sin gluten.» y no hay lista de compras. Si ya había un plan calculado, se conserva y se avisa.
- *Caso 4 (receta bloqueada por rotación, 180 porciones sin gluten y tope de pollo roto por el redondeo).* En <https://menuempauqe.netlify.app>:
  1. Más → Recetas → selector «Semana» = la semana anterior a la actual → en el menú de esa semana marcar **R4** (desmarcar otra receta para que queden 6) → **Guardar menú**. Volver a «Semana» = semana actual: R4 queda «Bloqueada por rotación» (el menú actual, R1–R6, no se toca; los topes siguen en 26 kg de pollo y 20 kg de res).
  2. Pedidos → «Semana» = actual → filtro «Sin gluten» = «Con gluten». Con el filtro «Plan» = `Plan 10`, **Editar** 10 pedidos, tildar «Sin gluten» y **Guardar cambios** (+100 porciones); luego con «Plan» = `Plan 5` hacer lo mismo con 11 pedidos (+55). Con los 25 que ya eran sin gluten, G = 180 (D sigue en 300).
  3. Inicio → **Calcular producción** → Plan. Continuo: R1 90,00, R2 57,50, R3 40,83, R5 30,00, R6 81,67 (R4 no aparece), costo `$14.950,83`. Enteros: 90 / 57 / 41 / 30 / 82, costo `$14.942,00`, kcal `541,83`, proteína `37,00`. Arriba del plan: «Las porciones enteras superan el tope de pollo en 40 g». En «Cómo se calculó» el primer extra va a R3 (0,833333), el segundo a R6 (0,666667) y R2 (0,5) no recibe. Compras: pollo 26.040 g, 14 empaques, `$4.172,00`, sobrante 1.960 g; res 13.630 g, 14 empaques, `$3.066,00`, sobrante 370 g.

### Los 4 casos del briefing y dónde se prueban

| Caso | Escenario | Test de dominio | Por la UI (E2E) |
|---|---|---|---|
| 1 | D = 300, pollo 26 kg, res 20 kg, G = 25: empate de fracciones R2/R4 | `briefingCases.test.ts` | sí (`ac01…`, y además lista de compras: pollo 25.940 g / 13 empaques / `$3.874,00` / sobrante 60 g; res 13.280 g / 14 / `$3.066,00` / 720 g) |
| 2 | D = 155, pollo 13 kg: el redondeo rompe el promedio de proteína | `briefingCases.test.ts` | sí (`ac01…`: porciones, costos, kcal, proteína, advertencia y compras) |
| 3 | D = 300, pollo 10 kg: sin solución | `briefingCases.test.ts` | sí (`ac01…`: mensaje exacto, sin lista de compras, plan anterior conservado) |
| 4 | R4 bloqueada por rotación, G = 180: el redondeo rompe el tope de pollo | `briefingCases.test.ts` | sí (`ac01…`: R4 al menú de la semana anterior, 180 porciones sin gluten editando pedidos, tablas continua y entera, tabla de redondeo, advertencia y compras) |

## Comandos

```bash
npm ci                  # instala dependencias (Node >= 20)
npm run dev             # servidor de desarrollo (Vite)
npm test                # pruebas unitarias e integración (Vitest)
npm run test:coverage   # igual, con cobertura; informe HTML en coverage/index.html
npm run test:e2e        # E2E con Playwright (compila y sirve la app en local; móvil 360 px + escritorio)
npm run test:e2e:prod   # mismo E2E contra https://menuempauqe.netlify.app (o BASE_URL=<otra url>)
npm run lint            # ESLint (prohíbe console.*)
npm run typecheck       # tsc --noEmit
npm run build           # typecheck + build de producción en dist/
```

La primera vez, Playwright necesita los navegadores: `npx playwright install chromium`.

## Cómo correrlo localmente

1. `npm ci`
2. `npm run dev` y abrir la URL que imprime Vite (por defecto `http://localhost:5173`).
3. La primera apertura genera los datos de ejemplo en IndexedDB (unos segundos). Las siguientes abren al instante.

Para ver la versión de producción: `npm run build && npm run preview` (puerto 4173).

## Qué está simulado

- **No hay backend ni servicios externos.** Todo (pedidos, recetas, historial, planes) vive en el navegador del usuario.
- **Los datos son de ejemplo**: clientes, pedidos, recetas e historial se generan de forma determinística. Los valores nutricionales y las metas (kcal, proteína) son datos de ejemplo configurables que **debe validar un profesional de la nutrición** antes de usarse con clientes.
- **IndexedDB en lugar de `localStorage`.** El briefing pide guardar 26.000 pedidos más eventos y snapshots; eso supera el límite de `localStorage` (~5 MB) y lo bloquearía el hilo principal. La sección de arquitectura del propio briefing exige IndexedDB, y así se hizo (acceso con la librería `idb`). Si el navegador no permite IndexedDB (por ejemplo, ventana privada con almacenamiento bloqueado) se muestra un aviso bloqueante.
- La «autenticación» del panel `/admin` es una clave dentro del código (ver más abajo): **no es seguridad real**.
- El reloj es el del navegador; en las pruebas se reemplaza por un reloj controlado.

## Datos de ejemplo

- **Contenido:** 2.000 clientes, 66 recetas (las 6 de prueba R1–R6 del briefing y 60 más de cocina del norte de México y saludable), 52 semanas de historial con 26.000 pedidos en total (380–620 por semana; plan 5 en 70 % y plan 10 en 30 %; sin gluten 6 %; ruta abierta 65 %, mañana 20 %, tarde 15 %), topes semanales de pollo (20–40 kg) y res (12–25 kg), el menú de cada semana y el plan calculado de cada semana histórica. La **semana actual** es el escenario del caso 1: 50 pedidos (40 de plan 5 y 10 de plan 10 = 300 porciones), 5 pedidos de 5 porciones sin gluten (G = 25), pollo 26 kg, res 20 kg, menú R1–R6.
- **Cómo se generan:** semilla fija **mulberry32 con semilla 2604**. Misma semilla y mismo reloj dan siempre los mismos datos.
- **Dónde está el código:** generador en `src/features/seed/application/generateSeed.ts`; catálogo (recetas, nombres) en `src/features/seed/domain/catalog.ts`; escritura en IndexedDB en `src/features/seed/infrastructure/seedDatabase.ts`; generador pseudoaleatorio en `src/shared/kernel/random.ts`.
- **Cómo reemplazarlos por datos propios:** cambiar el catálogo (`catalog.ts`) y/o las constantes del generador (`SEED_RNG_SEED`, `HISTORY_WEEKS`, `HISTORY_ORDER_TOTAL`, `CLIENT_COUNT` en `generateSeed.ts`) y restaurar los datos de ejemplo. La estructura de cada entidad está en los `domain/` de cada módulo (`orders/domain/order.ts`, `recipes/domain/recipe.ts`, `clients/domain/client.ts`, `planning/domain/menu.ts`).
- **Restaurar los datos de ejemplo:** Más → Ajustes → **Restaurar datos de ejemplo** → **Sí, restaurar**. Borra todo lo guardado en el navegador (pedidos, recetas, historial) y regenera la semilla. También sirve para volver al estado inicial después de probar.

## Panel `/admin`

Ruta `/admin` (también Más → Admin). Permite editar topes de pollo y res, banda de kcal, proteína mínima, % mínimo y máximo por receta, tamaño y precio de los paquetes, hora de cierre, cupo semanal y cupos y cargo de las rutas.

- **Clave:** `privee-cocina-2026`, definida en `src/features/admin/domain/adminKey.ts`.
- **No es autenticación real.** La clave viaja dentro del código que se descarga al navegador: cualquiera puede leerla. Solo evita cambios accidentales en la cocina. Un despliegue real necesita autenticación en un servidor. La propia pantalla lo avisa.

## Cómo se arma el modelo de producción

Código: `src/features/planning/domain/productionModel.ts` (modelo), `simplex.ts` (solver), `planProduction.ts` (orquestación).

- **Variables:** `x_r` = porciones a producir de cada receta activa `r` (continuas, ≥ 0).
- **Objetivo:** minimizar `Σ costo_r · x_r`.
- **Restricciones:**
  - `Σ x_r = D` (porciones totales de pedidos cerrados);
  - por receta: `10 % · D ≤ x_r ≤ 30 % · D` (configurable en Admin);
  - kcal promedio entre 480 y 545: `Σ kcal_r · x_r` dentro de `[480·D, 545·D]`;
  - proteína promedio mínima 37 g: `Σ prot_r · x_r ≥ 37·D`;
  - tope de pollo: `Σ pollo_g_r · x_r ≤ tope` y tope de res análogo;
  - sin gluten: `Σ (recetas sin gluten) x_r ≥ G`, solo si `G > 0`.
- **Rotación:** una receta servida la semana anterior queda **fuera del modelo** (y fuera del mínimo de 10 %). El menú de cada semana son 6 recetas.
- **Desempate:** a igual costo se maximiza la proteína total. Se resuelve un segundo modelo con la misma estructura, fijando `costo = óptimo` y maximizando proteína. Si aun así empatan, se acepta cualquier solución con ese costo y esa proteína.
- **Casos previos al solver:** `D = 0` («Todavía no hay pedidos cerrados para esta semana»), menos de 4 recetas activas (máximo posible 3 × 30 % = 90 % de D: sin solución al instante, sin correr el símplex) y `G > D` (cálculo rechazado).

## Símplex de dos fases

`src/features/planning/domain/simplex.ts`, sin librerías de optimización.

- Tableau denso; cada restricción `≤` agrega una variable de **holgura**, `≥` una de **exceso** y una **artificial**, `=` una **artificial**. Los lados derechos se normalizan a ≥ 0.
- **Fase 1** minimiza la suma de artificiales (si el óptimo no es 0, no hay solución factible). **Fase 2** minimiza el objetivo real.
- **Regla de Bland** (entra la columna de menor índice entre las que mejoran; sale la variable básica de menor índice ante empates en la razón): garantiza terminación.
- **Tolerancia numérica 1e-9** (`SIMPLEX_TOLERANCE`).
- **Traza:** se guarda la tabla inicial, cada pivote (variable que entra y sale, elemento pivote, tabla resultante) y la tabla final de cada fase. La pantalla **Plan → Cómo se calculó** muestra esa traza real, no una reconstrucción.

## Redondeo por mayor resto

`src/features/planning/domain/largestRemainder.ts`. Cada `x_r` se redondea a 6 decimales, se toma la parte entera, `R = D − Σ partes enteras` y se suma 1 porción a las `R` recetas con mayor fracción (la fracción también se redondea a 6 decimales). **Desempate:** gana el código de receta menor (R1 antes que R2). Si la solución continua ya es entera, `R = 0` y no se reparte nada. La tabla de la pantalla de explicación muestra valor continuo, parte entera, fracción, orden, extra (`+1`) y final.

## Verificación posterior al redondeo

`src/features/planning/domain/verification.ts`. Con las porciones enteras se recalculan costo, kcal promedio y proteína promedio (2 decimales, mitad hacia arriba) y el uso de los topes. Si algo se rompe, se muestra una advertencia **no bloqueante arriba del plan** (nunca en un tooltip). Textos exactos:

- «Proteína promedio 36,98 g: queda por debajo del mínimo de 37 g»
- «Kcal promedio 546,10: queda por encima del máximo de 545»
- «Kcal promedio 479,50: queda por debajo del mínimo de 480»
- «Las porciones enteras superan el tope de pollo en 40 g»
- «Las porciones enteras superan el tope de res en 15 g»

## Compras por empaque

`src/features/shopping/domain/shoppingList.ts`. Gramos por insumo = `Σ g_r × porciones enteras`; empaques = `ceil(gramos / tamaño del empaque)`; costo = `empaques × precio`; sobrante = `empaques × tamaño − gramos`. Pollo: empaques de 2.000 g a `$298,00`. Res: empaques de 1.000 g a `$219,00` (editables en Admin). Un múltiplo exacto no sube de empaque (26.000 g = 13 empaques, sobrante 0). **Exportar CSV** en la pantalla Compras. Si no hay plan posible no se muestra lista de compras.

## Pedidos, cierre, cupos y rutas

- **Cierre:** sábado 11:30:00 (hora de Monterrey) **inclusive**. Un pedido a las 11:30:00 entra en la semana actual; a las 11:30:01 pasa a la siguiente, con aviso que indica la fecha del domingo.
- **Cupo semanal:** 600 porciones, que se reinicia cada domingo. Un pedido que no cabe entero (por ejemplo, de 10 porciones con 5 libres) **no se parte**: pasa completo a la semana siguiente.
- **Rutas del domingo:** abierta 8:00–17:00 gratis (cupo 90 entregas), mañana 8:00–12:00 con cargo de `$99` (cupo 30) y tarde 13:00–17:00 con cargo de `$99` (cupo 30). Si la ruta elegida está llena, el pedido pasa a la ruta abierta con aviso; si la abierta también está llena, pasa a la semana siguiente. Cancelar devuelve el cupo. Todo se reinicia cada domingo.
- **Editar o cancelar un pedido:** después del cierre de su semana ya no se puede (aviso: «El pedido P-000123 es de una semana cerrada el sábado a las 11:30: ya no se puede cambiar porque la producción se calculó con él.»; la hora es la configurada en Admin). Una edición **no cambia de semana**: si el plan nuevo no entra en el cupo semanal o la ruta elegida está llena, se rechaza con un aviso que lo explica y el pedido queda como estaba. El cargo de ruta sigue a la ruta (se cobra al pasar a mañana/tarde y se quita al pasar a la abierta). Código: `src/features/orders/domain/editOrder.ts` y `ChangeService.saveOrder`.
- **Pedidos simultáneos:** la verificación de cupos y la escritura del pedido nuevo ocurren en una sola transacción de IndexedDB, así que dos pestañas no pueden ocupar el último lugar a la vez.
- Pantallas: Pedidos (tabla virtualizada con búsqueda por cliente o código y filtros de semana, plan, ruta y sin gluten; formulario de alta) y Rutas (ocupación de cada ruta).

## Historial, deshacer/rehacer y «Estado al…»

- **Eventos inmutables:** cada cambio (pedidos, recetas, menús, ajustes, planes marcados como desactualizados) guarda usuario, fecha y hora, entidad, campo, valor anterior y valor nuevo. El usuario es el nombre del campo **Operador** del encabezado (por pestaña).
- **Deshacer/rehacer, 50 pasos:** deshacer y rehacer **agregan eventos compensatorios** (no borran historial). Más allá de 50 pasos, el botón avisa «No hay más pasos para deshacer (máximo 50)».
- **Deshacer/rehacer seguro:** no pisa cambios de otra pestaña. Si el pedido, la receta, el menú o los ajustes cambiaron en otra pestaña desde ese paso, se rechaza con un aviso y no se escribe nada (el paso se descarta). Tampoco se puede deshacer/rehacer un pedido de una semana ya cerrada, ni restaurar un pedido cancelado si el cupo ya no alcanza (el paso queda disponible). Si otra pestaña restaura los datos de ejemplo, la pila de deshacer de todas las pestañas se vacía.
- **Snapshots semanales:** antes del primer cambio de cada semana se guarda una foto del estado de recetas, menús y ajustes (más una foto base inicial).
- **«Estado al…»:** reconstruye el estado en un instante reproduciendo los eventos desde el snapshot más cercano (los pedidos también se filtran por fecha de creación), recalcula el plan con esos datos y muestra las porciones que se habrían cocinado. Antes del primer registro muestra el estado inicial de los datos de ejemplo con el aviso «Antes del primer registro».
- **Plan desactualizado:** si cambia un precio, una receta, un menú, un ajuste o un pedido después de calcular, el plan se marca «desactualizado» hasta recalcular, y queda registrado. La detección reconstruye la entrada que usaría el próximo cálculo (recetas activas del menú, topes efectivos, rotación) y la compara con la guardada; si algo cambió mientras el cálculo corría, el plan se guarda ya como desactualizado. Los cambios se avisan a las otras pestañas después de marcar los planes, y calcular/recalcular también avisa.

## Dos pestañas y regla de conflicto

La sincronización usa `BroadcastChannel` (`src/shared/infrastructure/syncChannel.ts`); cada pestaña avisa a las demás y refresca sus pantallas. Si **dos pestañas editan el mismo pedido**:

- Antes del cierre gana **la última versión guardada**.
- Si una edición se guarda **después del sábado 11:30**, gana la versión guardada **antes del cierre** (la producción ya se calculó con ella).
- Una edición tardía sobre la versión que la pestaña había cargado (sin que otra pestaña haya guardado) directamente se rechaza por semana cerrada; la regla de conflicto aplica cuando la versión guardada ya cambió.
- En ambos casos se muestra un aviso con **los dos valores**, se ofrece **Elegir el otro valor** (si el cierre lo permite) y todo queda registrado en el historial como conflicto.

Código: `src/features/orders/domain/conflict.ts` y `ChangeService.saveOrder`.

## Arquitectura

DDD con *vertical slices* y principios SOLID. Cada módulo vive en `src/features/<módulo>/` con cuatro capas:

```
src/
  app/                  composición: container.ts (único lugar que une puertos y adaptadores), shell, rutas, providers
  features/
    <módulo>/
      domain/           TypeScript puro (sin React ni IndexedDB): reglas, entidades, cálculos
      application/      casos de uso; dependen de puertos (interfaces)
      infrastructure/   adaptadores: repositorios IndexedDB, Web Worker, sincronización
      ui/               pantallas React (contenedores + vistas presentacionales)
    admin  clients  history  home  orders  planning  recipes  routes  seed  shopping
  shared/
    kernel/             tiempo (UTC−6, semanas, cierre), formato numérico es-MX, aleatorio con semilla
    infrastructure/     apertura de IndexedDB, canal de sincronización
    ui/                 componentes base (botón, tarjeta, tabla, lista virtualizada, avisos)
e2e/                    pruebas Playwright
```

- **Puertos y adaptadores:** la capa `application` define interfaces (`ports.ts`) y la capa `infrastructure` las implementa; el `container.ts` es el único lugar que conoce ambas. Los casos de uso se prueban con repositorios reales sobre `fake-indexeddb`.
- **Web Worker:** el cálculo (semana actual y recálculo de las 52 semanas) corre en `src/features/planning/infrastructure/plan.worker.ts`, por lo que la interfaz no se congela. En pruebas se usa `InlinePlanRunner`, que ejecuta el mismo código sin worker.
- **Tabla virtualizada:** la lista de pedidos usa `@tanstack/react-virtual` para manejar miles de filas.
- **Diseño:** mobile-first (360 px), tipografías IBM Plex Sans y Space Grotesk, paleta del briefing.

## Estrategia de pruebas

- **Unitarias (Vitest):** dominio puro (símplex, modelo, mayor resto, verificación, compras, cierre y cupos, conflictos, validación de recetas, formato de números, fechas).
- **Integración:** casos de uso sobre `fake-indexeddb` con la app completa sembrada (`src/app/__tests__/integration.test.ts`: 26.000 pedidos, caso 1, pedido tardío, 50 pasos de deshacer, «Estado al…», restaurar datos), conflicto entre pestañas, repositorios y semilla.
- **Componentes (Testing Library):** pantallas con sus estados vacíos y de error.
- **E2E (Playwright):** proyectos `mobile-360` (360 × 740) y `desktop` (1280 × 800), ver tabla de arriba. Cada test usa un contexto nuevo (IndexedDB limpia) y un reloj controlado con `page.clock` (viernes 2026-11-13 10:00 Monterrey; sábado 11:31 para el criterio 7), por lo que los resultados son deterministas. Los dos usuarios del criterio 10 son dos pestañas del mismo contexto (misma IndexedDB y mismo `BroadcastChannel`). Además se verifican: aviso bloqueante sin IndexedDB, clave de `/admin`, restaurar datos de ejemplo, semana vacía y ausencia de errores de consola al recorrer todas las pantallas.
- **Cobertura:** `npm run test:coverage` (informe en `coverage/index.html`). Umbral de 80 % en líneas, funciones, ramas y sentencias, medido sobre el motor y la lógica de aplicación (planificación, compras, pedidos, rutas, recetas, admin, tiempo, historial, semilla). Resultado de la última corrida: sentencias 97,56 %, ramas 86,31 %, funciones 99,58 %, líneas 99,43 %.
- **Estado de la última corrida:** 31 archivos y 245 pruebas unitarias/integración en verde (`npm test`); 21 pruebas E2E por proyecto, 42 en total, en verde (`npm run test:e2e`). Las pruebas son independientes entre sí: `npx vitest run --sequence.shuffle` (semillas 1, 2 y 3) también pasa completo.

## Decisiones y supuestos

- **Zona horaria:** America/Monterrey = UTC−6 fijo, sin horario de verano (no hay DST desde 2022).
- **Cierre:** 11:30:00 inclusive. El identificador de una semana es el domingo de entrega (`AAAA-MM-DD`). `productionWeekId` es el primer domingo posterior a la fecha local: después del cierre del sábado la semana en producción sigue siendo la que cerró, hasta el domingo, cuando empieza un ciclo nuevo y se reinician los cupos.
- **Semanas de historial sin cupos:** las semanas históricas son registros importados y **no están sujetas a los cupos**. El briefing pide 380–620 pedidos por semana (unas 3.000 porciones), que excede el cupo de 600 porciones y los de las rutas; los cupos se aplican a los pedidos creados en la app y a la semana actual.
- **34 de las 52 semanas de historial tienen plan factible:** el generador busca (hasta 200 intentos por semana) un menú de 6 recetas que no repita el de la semana anterior y sea factible con los topes de esa semana. Como cada receta del menú debe producirse al menos el 10 % de D (unas 3.000 porciones por semana) y los topes del briefing son de 20–40 kg de pollo y 12–25 kg de res, muchos menús de 6 recetas con carne no caben. En 18 semanas ninguno de los intentos fue factible, y ese plan queda guardado como «sin solución» (mensaje exacto del briefing). «Recalcular las 52 semanas» las recalcula todas y conserva el plan anterior donde sigue sin haber solución.
- **Semana actual = escenario del caso 1**, con algunos pedidos entre el sábado 11:00 y el 11:30 para que «Estado al…» a las 11:00 se diferencie del cierre.
- **Operador por pestaña:** se guarda en `sessionStorage`; cada evento registra el nombre.
- **Clave de admin en el código** (ver arriba): decisión del briefing, documentada como no segura.
- **IndexedDB en vez de `localStorage`:** ver «Qué está simulado».
- **Textos de la app en español rioplatense** (voseo); código, pruebas y documentación técnica en inglés, salvo este README.

## Despliegue en Netlify

`netlify.toml` ya está configurado:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node:** 20
- **Redirección SPA:** `/* → /index.html` con estado 200, para que `/plan`, `/historial`, etc. funcionen al recargar.
- Los archivos de `/assets/*` se sirven con caché larga e inmutable.

No hace falta ninguna variable de entorno.
