/**
 * Generic two-phase simplex method on a dense tableau (minimisation, x >= 0).
 *
 * - Constraints may be <=, >= or =; slack (s), surplus (e) and artificial (a)
 *   columns are added as needed. Right-hand sides are normalised to be >= 0.
 * - Phase 1 minimises the sum of artificials, phase 2 the real objective.
 * - Bland's rule (lowest-index entering among improving columns, lowest-index
 *   basic variable leaving among ratio ties) guarantees termination.
 * - A full trace (initial tableau, every pivot, final tableau, per phase) is
 *   recorded so the UI can show the real calculation.
 */

export const SIMPLEX_TOLERANCE = 1e-9;
const MAX_ITERATIONS = 20000;

export type ConstraintSense = '<=' | '>=' | '=';

export interface LpConstraint {
  label: string;
  coefficients: number[];
  sense: ConstraintSense;
  rhs: number;
}

/** Minimise `objective · x` subject to `constraints` and x >= 0. */
export interface LpProblem {
  variableNames: string[];
  objective: number[];
  constraints: LpConstraint[];
}

export interface TableauSnapshot {
  /** Column names (variables, slack/surplus, artificials). */
  columns: string[];
  /** Name of the basic variable of each row. */
  basis: string[];
  /** Constraint label of each row. */
  rowLabels: string[];
  /** Constraint rows; every row has `columns.length` coefficients followed by the RHS. */
  rows: number[][];
  /** Reduced costs, one per column. */
  reducedCosts: number[];
  /** Current objective value of the phase. */
  objectiveValue: number;
}

export interface PivotStep {
  phase: 1 | 2;
  iteration: number;
  entering: string;
  leaving: string;
  pivotRow: number;
  pivotColumn: number;
  tableau: TableauSnapshot;
}

export interface PhaseTrace {
  phase: 1 | 2;
  initial: TableauSnapshot;
  pivots: PivotStep[];
  final: TableauSnapshot;
}

export interface SimplexTrace {
  phases: PhaseTrace[];
}

export type SimplexStatus = 'optimal' | 'infeasible' | 'unbounded';

export interface SimplexResult {
  status: SimplexStatus;
  /** Values of the original variables; empty unless optimal. */
  solution: number[];
  objectiveValue: number | null;
  trace: SimplexTrace;
}

export interface SimplexOptions {
  tolerance?: number;
}

interface State {
  columns: string[];
  rowLabels: string[];
  rows: number[][];
  basis: number[];
  /** Reduced-cost row; last cell holds minus the objective value. */
  obj: number[];
}

function snapshot(state: State): TableauSnapshot {
  const width = state.columns.length;
  return {
    columns: [...state.columns],
    basis: state.basis.map((b) => state.columns[b] ?? ''),
    rowLabels: [...state.rowLabels],
    rows: state.rows.map((r) => [...r]),
    reducedCosts: state.obj.slice(0, width),
    objectiveValue: -(state.obj[width] ?? 0) || 0,
  };
}

function priceOut(state: State, cost: number[]): void {
  const width = state.columns.length;
  state.obj = [...cost, 0];
  state.rows.forEach((row, i) => {
    const cb = cost[state.basis[i] ?? 0] ?? 0;
    if (cb === 0) return;
    for (let j = 0; j <= width; j++) state.obj[j] = (state.obj[j] ?? 0) - cb * (row[j] ?? 0);
  });
}

function pivot(state: State, r: number, c: number): void {
  const width = state.columns.length;
  const pivotRow = state.rows[r] as number[];
  const p = pivotRow[c] as number;
  for (let j = 0; j <= width; j++) pivotRow[j] = (pivotRow[j] as number) / p;
  pivotRow[c] = 1;
  const eliminate = (target: number[]) => {
    const factor = target[c] as number;
    if (factor === 0) return;
    for (let j = 0; j <= width; j++) target[j] = (target[j] as number) - factor * (pivotRow[j] as number);
    target[c] = 0;
  };
  state.rows.forEach((row, i) => {
    if (i !== r) eliminate(row);
  });
  eliminate(state.obj);
  state.basis[r] = c;
}

function chooseEntering(state: State, tol: number, usable: number): number {
  for (let j = 0; j < usable; j++) if ((state.obj[j] as number) < -tol) return j;
  return -1;
}

function chooseLeaving(state: State, col: number, tol: number): number {
  const width = state.columns.length;
  let best = -1;
  let bestRatio = Infinity;
  state.rows.forEach((row, i) => {
    const a = row[col] as number;
    if (a <= tol) return;
    const ratio = (row[width] as number) / a;
    const tied = Math.abs(ratio - bestRatio) <= tol;
    if (ratio < bestRatio - tol || (tied && (state.basis[i] as number) < (state.basis[best] as number))) {
      bestRatio = Math.min(ratio, bestRatio);
      best = i;
    }
  });
  return best;
}

function runPhase(
  state: State,
  phase: 1 | 2,
  usableColumns: number,
  tol: number,
): { outcome: 'optimal' | 'unbounded'; phaseTrace: PhaseTrace } {
  const initial = snapshot(state);
  const pivots: PivotStep[] = [];
  let outcome: 'optimal' | 'unbounded' = 'optimal';
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const col = chooseEntering(state, tol, usableColumns);
    if (col < 0) break;
    const row = chooseLeaving(state, col, tol);
    if (row < 0) {
      outcome = 'unbounded';
      break;
    }
    const leaving = state.columns[state.basis[row] as number] as string;
    pivot(state, row, col);
    pivots.push({
      phase,
      iteration,
      entering: state.columns[col] as string,
      leaving,
      pivotRow: row,
      pivotColumn: col,
      tableau: snapshot(state),
    });
  }
  return { outcome, phaseTrace: { phase, initial, pivots, final: snapshot(state) } };
}

function validate(problem: LpProblem): void {
  const n = problem.variableNames.length;
  if (problem.objective.length !== n) {
    throw new Error('Objective length must match the number of variables');
  }
  for (const c of problem.constraints) {
    if (c.coefficients.length !== n) {
      throw new Error(`Constraint "${c.label}" must have ${n} coefficients`);
    }
  }
}

function buildInitialState(problem: LpProblem): { state: State; artificialStart: number; artificialCount: number } {
  const m = problem.constraints.length;
  const normalised = problem.constraints.map((c) => {
    if (c.rhs >= 0) return c;
    const sense: ConstraintSense = c.sense === '<=' ? '>=' : c.sense === '>=' ? '<=' : '=';
    return { ...c, coefficients: c.coefficients.map((v) => -v), rhs: -c.rhs, sense };
  });

  const columns = [...problem.variableNames];
  const slackIndex: number[] = new Array<number>(m).fill(-1);
  normalised.forEach((c, i) => {
    if (c.sense === '=') return;
    slackIndex[i] = columns.length;
    columns.push(c.sense === '<=' ? `s${i + 1}` : `e${i + 1}`);
  });
  const artificialStart = columns.length;
  const artificialIndex: number[] = new Array<number>(m).fill(-1);
  normalised.forEach((c, i) => {
    if (c.sense === '<=') return;
    artificialIndex[i] = columns.length;
    columns.push(`a${i + 1}`);
  });

  const width = columns.length;
  const basis: number[] = [];
  const rows = normalised.map((c, i) => {
    const row = new Array<number>(width + 1).fill(0);
    c.coefficients.forEach((v, j) => {
      row[j] = v;
    });
    if (c.sense === '<=') row[slackIndex[i] as number] = 1;
    if (c.sense === '>=') row[slackIndex[i] as number] = -1;
    if (c.sense !== '<=') row[artificialIndex[i] as number] = 1;
    row[width] = c.rhs;
    basis.push(c.sense === '<=' ? (slackIndex[i] as number) : (artificialIndex[i] as number));
    return row;
  });

  return {
    state: { columns, rowLabels: normalised.map((c) => c.label), rows, basis, obj: [] },
    artificialStart,
    artificialCount: width - artificialStart,
  };
}

/** Pivots remaining artificial variables out of the basis; drops redundant rows. */
function evictArtificials(state: State, artificialStart: number, tol: number, phase1: PhaseTrace): void {
  for (let i = state.rows.length - 1; i >= 0; i--) {
    if ((state.basis[i] as number) < artificialStart) continue;
    const row = state.rows[i] as number[];
    let col = -1;
    for (let j = 0; j < artificialStart; j++) {
      if (Math.abs(row[j] as number) > tol) {
        col = j;
        break;
      }
    }
    if (col < 0) {
      state.rows.splice(i, 1);
      state.basis.splice(i, 1);
      state.rowLabels.splice(i, 1);
      continue;
    }
    const leaving = state.columns[state.basis[i] as number] as string;
    pivot(state, i, col);
    phase1.pivots.push({
      phase: 1,
      iteration: phase1.pivots.length + 1,
      entering: state.columns[col] as string,
      leaving,
      pivotRow: i,
      pivotColumn: col,
      tableau: snapshot(state),
    });
  }
  phase1.final = snapshot(state);
}

function dropArtificialColumns(state: State, artificialStart: number): void {
  state.columns = state.columns.slice(0, artificialStart);
  state.rows = state.rows.map((row) => [...row.slice(0, artificialStart), row[row.length - 1] as number]);
}

export function solveSimplex(problem: LpProblem, options: SimplexOptions = {}): SimplexResult {
  validate(problem);
  const tol = options.tolerance ?? SIMPLEX_TOLERANCE;
  const n = problem.variableNames.length;
  const { state, artificialStart, artificialCount } = buildInitialState(problem);
  const trace: SimplexTrace = { phases: [] };
  const fail = (status: SimplexStatus): SimplexResult => ({
    status,
    solution: [],
    objectiveValue: null,
    trace,
  });

  if (artificialCount > 0) {
    const cost1 = state.columns.map((_, j) => (j >= artificialStart ? 1 : 0));
    priceOut(state, cost1);
    const { phaseTrace } = runPhase(state, 1, state.columns.length, tol);
    trace.phases.push(phaseTrace);
    const scale = Math.max(1, ...state.rows.map((r) => Math.abs(r[r.length - 1] as number)));
    if (-(state.obj[state.columns.length] as number) > tol * scale) return fail('infeasible');
    evictArtificials(state, artificialStart, tol, phaseTrace);
    dropArtificialColumns(state, artificialStart);
  }

  const cost2 = state.columns.map((_, j) => (j < n ? (problem.objective[j] as number) : 0));
  priceOut(state, cost2);
  const { outcome, phaseTrace } = runPhase(state, 2, state.columns.length, tol);
  trace.phases.push(phaseTrace);
  if (outcome === 'unbounded') return fail('unbounded');

  const width = state.columns.length;
  const solution = new Array<number>(n).fill(0);
  state.basis.forEach((b, i) => {
    if (b < n) solution[b] = state.rows[i]?.[width] ?? 0;
  });
  return {
    status: 'optimal',
    solution: solution.map((v) => (Math.abs(v) < tol ? 0 : v)),
    objectiveValue: -(state.obj[width] as number) || 0,
    trace,
  };
}
