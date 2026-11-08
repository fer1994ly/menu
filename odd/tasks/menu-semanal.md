# Feature: menu-semanal — Privee Food weekly batch production planner

## Objective
Browser app (React + TS + Tailwind + IndexedDB + Web Worker) that computes the minimum-cost weekly production plan with an in-house two-phase simplex, rounds with largest remainder, verifies post-rounding, builds the shopping list by package, and manages orders, recipes, routes, history/«estado al…», cross-tab sync and an /admin panel. Full rules: `docs/BRIEFING.md` (source of truth).

## Constraints
- No optimization libraries. No backend. No external services. No `console.*` in source (ESLint `no-console: error`).
- UI copy in Spanish with voseo; code/identifiers/docs in English.
- Architecture: DDD vertical slices + SOLID. `src/features/<slice>/{domain,application,infrastructure,ui}`; `src/shared/` kernel. Domain is pure TS (no React, no IndexedDB). Application depends on ports (interfaces); infrastructure implements them.
- Strict TDD (RED → GREEN → REFACTOR). Runner: Vitest (`npm test`), coverage via `@vitest/coverage-v8` with ≥ 80 % threshold enforced on engine (planning + shopping domain). E2E: Playwright, projects `mobile-360` (360×740) and `desktop`.
- Commits: Conventional Commits, NO AI attribution / Co-Authored-By trailers (user global rule). Work on branch `feat/menu-semanal`; fast-forward `main` and push at the end (user explicitly asked to push).
- Repo is public (user decision): no mentions of the intermediary platform anywhere.

## Resolved decisions (briefing gaps / contradictions)
- Timezone: America/Monterrey = fixed UTC−6 (no DST since 2022). Order belongs to the first Saturday-11:30:00 close ≥ createdAt (11:30:00 inclusive, 11:30:01 next week); week id = delivery Sunday date (YYYY-MM-DD).
- Seed history (380–620 orders/week ≈ 3k portions) exceeds the 600-portion and route quotas: history weeks are imported records not subject to quotas; quotas apply to orders created through the app and to the current-week seed. History menu selection: deterministic search (up to 200 attempts per week) for a 6-recipe set not repeating the previous week that is feasible under that week's caps; if none, the week's stored plan is the no-solution result (documented in README).
- Current week seed = briefing scenario: 50 orders (40×plan 5 + 10×plan 10 = 300 portions), 5 gluten-free orders of 5 (G = 25), chicken cap 26 kg, beef 20 kg, menu R1–R6, previous week menu contains none of R1–R6 → plan equals test case 1. A few orders between Saturday 11:00 and 11:30 so «estado al…» 11:00 differs. Timestamps ≤ min(now, close).
- 52 history weeks with exactly 26.000 orders total; 2.000 clients; mulberry32 seed 2604.
- Undo/redo: undo/redo append compensating immutable events; stack 50 per tab session.
- «Estado al…»: weekly snapshots + replay of events ≤ T; seed orders also filtered by createdAt ≤ T.
- Admin key in code (`src/features/admin/domain/adminKey.ts`), documented as not real auth.
- Users: selectable operator name per tab (stored in sessionStorage), recorded on each event.
- Briefing's "todo en localStorage" notice conflicts with the briefing's architecture section (IndexedDB required): IndexedDB used; README explains.

## Tasks
- [x] T0 Repo init, briefing captured, feature doc — route: inline (mechanical).
- [x] T1 Scaffold & tooling: Vite+React+TS strict, Tailwind (palette/fonts via @fontsource), ESLint no-console, Vitest+coverage thresholds, Playwright config, netlify.toml, slice skeleton — route: delegated (writer trigger: 2+ files).
- [x] T2 Planning engine: two-phase simplex (Bland, 1e-9, pivot trace), lexicographic tie-break model, model builder (rotation, 10–30 %, pre-checks D=0 / <4 recipes / G>D), largest remainder, post-rounding verification messages, half-up formatting; 4 briefing cases + edge cases as tests — route: delegated.
- [x] T3 Shopping + orders/routes/close domain + conflict rule + recipe validation (pure) with tests — route: delegated.
- [x] T4 Persistence & data: IndexedDB repos, event store, undo/redo 50, snapshots + state-at, BroadcastChannel sync & conflicts, seed generator, restore sample data, Web Worker (current week + 52-week recalculation), perf test — route: delegated.
- [ ] T5 UI: all screens (home, orders, recipes, plan, explanation, shopping, routes, history, admin, settings), empty/error states, mobile-first 360 px — route: delegated.
- [ ] T6 E2E Playwright (mobile + desktop), README with reviewer checklist mapped to acceptance criteria, Netlify deploy prep, push — route: delegated + inline git.

## Acceptance criteria
See `docs/BRIEFING.md` → "Acceptance criteria" (11 items). README must map each to a test/command.

## Checks
`npm run lint` · `npm run typecheck` · `npm test` · `npm run test:coverage` · `npm run test:e2e` · `npm run build`

## TDD
Mode: strict (source: user global config "Strict TDD Mode: enabled" + user request "AI TDD"). Runner: Vitest; E2E Playwright.

## Delivery
Strategy: user asked for a direct push to `main`; work-unit commits per task on `feat/menu-semanal`, then fast-forward `main`.

## Progress / evidence
- T0: done.
- T1: 2348f68. T2: b731d95, 086809d, d47700f. npm test 65/65 pass; engine coverage stmts 99.66%, branches 86.09%, funcs 100%, lines 100%; lint/typecheck/build OK; playwright smoke 2/2.
- Review: RDD consent for T1–T2 slice (medium) left unanswered; user asked to push.
- T3: 7787d87, c191c2e, 87d89c2, 06402be — 127 tests pass.
- T4: a90122d, 8763f3f, 4608cde, 5911a35, eb3a84b — 186 tests pass, coverage 97/85/98/99; perf 600-portion + 52 weeks well under 4 s. 34/52 history weeks feasible (rest store no-solution plan, documented).
