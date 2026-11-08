import { describe, expect, it } from 'vitest';
import { solveSimplex, type LpProblem } from '../simplex';

const close = (a: number | undefined, b: number) => {
  expect(a).toBeDefined();
  expect(Math.abs((a as number) - b)).toBeLessThan(1e-7);
};

describe('solveSimplex: textbook problems', () => {
  it('solves a pure <= minimisation without phase 1', () => {
    const p: LpProblem = {
      variableNames: ['x', 'y'],
      objective: [-3, -5],
      constraints: [
        { label: 'c1', coefficients: [1, 0], sense: '<=', rhs: 4 },
        { label: 'c2', coefficients: [0, 2], sense: '<=', rhs: 12 },
        { label: 'c3', coefficients: [3, 2], sense: '<=', rhs: 18 },
      ],
    };
    const r = solveSimplex(p);
    expect(r.status).toBe('optimal');
    close(r.solution[0], 2);
    close(r.solution[1], 6);
    close(r.objectiveValue ?? NaN, -36);
    expect(r.trace.phases.map((ph) => ph.phase)).toEqual([2]);
  });

  it('needs two phases for >= constraints', () => {
    const r = solveSimplex({
      variableNames: ['x', 'y'],
      objective: [2, 3],
      constraints: [
        { label: 'a', coefficients: [1, 1], sense: '>=', rhs: 4 },
        { label: 'b', coefficients: [1, 3], sense: '>=', rhs: 6 },
      ],
    });
    expect(r.status).toBe('optimal');
    close(r.solution[0], 3);
    close(r.solution[1], 1);
    close(r.objectiveValue ?? NaN, 9);
    expect(r.trace.phases.map((ph) => ph.phase)).toEqual([1, 2]);
  });

  it('handles equality constraints', () => {
    const r = solveSimplex({
      variableNames: ['x', 'y'],
      objective: [1, 2],
      constraints: [
        { label: 'sum', coefficients: [1, 1], sense: '=', rhs: 5 },
        { label: 'cap', coefficients: [1, 0], sense: '<=', rhs: 3 },
      ],
    });
    expect(r.status).toBe('optimal');
    close(r.solution[0], 3);
    close(r.solution[1], 2);
    close(r.objectiveValue ?? NaN, 7);
  });

  it('normalises negative right-hand sides', () => {
    const r = solveSimplex({
      variableNames: ['x'],
      objective: [1],
      constraints: [{ label: 'lb', coefficients: [-1], sense: '<=', rhs: -2 }],
    });
    expect(r.status).toBe('optimal');
    close(r.solution[0], 2);
    const r2 = solveSimplex({
      variableNames: ['x'],
      objective: [-1],
      constraints: [{ label: 'ub', coefficients: [-1], sense: '>=', rhs: -7 }],
    });
    close(r2.solution[0], 7);
  });

  it('detects infeasibility', () => {
    const r = solveSimplex({
      variableNames: ['x'],
      objective: [1],
      constraints: [
        { label: 'lo', coefficients: [1], sense: '>=', rhs: 5 },
        { label: 'hi', coefficients: [1], sense: '<=', rhs: 3 },
      ],
    });
    expect(r.status).toBe('infeasible');
    expect(r.objectiveValue).toBeNull();
    expect(r.solution).toEqual([]);
  });

  it('detects unboundedness', () => {
    const r = solveSimplex({
      variableNames: ['x', 'y'],
      objective: [-1, 0],
      constraints: [{ label: 'c', coefficients: [1, -1], sense: '<=', rhs: 1 }],
    });
    expect(r.status).toBe('unbounded');
    expect(r.objectiveValue).toBeNull();
  });

  it('reports an exhausted iteration budget as its own status, never as optimal', () => {
    const problem = {
      variableNames: ['x', 'y'],
      objective: [-3, -2],
      constraints: [
        { label: 'a', coefficients: [1, 1], sense: '<=' as const, rhs: 4 },
        { label: 'b', coefficients: [1, 0], sense: '<=' as const, rhs: 3 },
      ],
    };
    expect(solveSimplex(problem).status).toBe('optimal');
    const limited = solveSimplex(problem, { maxIterations: 1 });
    expect(limited.status).toBe('iteration-limit');
    expect(limited.solution).toEqual([]);
    expect(limited.objectiveValue).toBeNull();
  });

  it('reports the iteration limit during phase 1 too, not as infeasible', () => {
    const limited = solveSimplex(
      {
        variableNames: ['x', 'y'],
        objective: [1, 1],
        constraints: [
          { label: 'a', coefficients: [1, 1], sense: '>=' as const, rhs: 4 },
          { label: 'b', coefficients: [1, 0], sense: '<=' as const, rhs: 3 },
        ],
      },
      { maxIterations: 0 },
    );
    expect(limited.status).toBe('iteration-limit');
  });

  it('terminates on Beale cycling example thanks to Bland rule', () => {
    const r = solveSimplex({
      variableNames: ['x1', 'x2', 'x3', 'x4'],
      objective: [-0.75, 20, -0.5, 6],
      constraints: [
        { label: 'r1', coefficients: [0.25, -8, -1, 9], sense: '<=', rhs: 0 },
        { label: 'r2', coefficients: [0.5, -12, -0.5, 3], sense: '<=', rhs: 0 },
        { label: 'r3', coefficients: [0, 0, 1, 0], sense: '<=', rhs: 1 },
      ],
    });
    expect(r.status).toBe('optimal');
    close(r.objectiveValue ?? NaN, -1.25);
  });

  it('copes with redundant equality constraints', () => {
    const r = solveSimplex({
      variableNames: ['x', 'y'],
      objective: [1, 0],
      constraints: [
        { label: 'e1', coefficients: [1, 1], sense: '=', rhs: 2 },
        { label: 'e2', coefficients: [2, 2], sense: '=', rhs: 4 },
      ],
    });
    expect(r.status).toBe('optimal');
    close(r.objectiveValue ?? NaN, 0);
    close(r.solution[1], 2);
  });

  it('rejects malformed problems', () => {
    expect(() =>
      solveSimplex({
        variableNames: ['x', 'y'],
        objective: [1],
        constraints: [],
      }),
    ).toThrow();
    expect(() =>
      solveSimplex({
        variableNames: ['x'],
        objective: [1],
        constraints: [{ label: 'bad', coefficients: [1, 2], sense: '<=', rhs: 1 }],
      }),
    ).toThrow();
  });

  it('solves a problem without rows', () => {
    const r = solveSimplex({ variableNames: ['x'], objective: [1], constraints: [] });
    expect(r.status).toBe('optimal');
    close(r.solution[0], 0);
  });
});

describe('solveSimplex: trace', () => {
  const problem: LpProblem = {
    variableNames: ['x', 'y'],
    objective: [2, 3],
    constraints: [
      { label: 'a', coefficients: [1, 1], sense: '>=', rhs: 4 },
      { label: 'b', coefficients: [1, 3], sense: '>=', rhs: 6 },
    ],
  };

  it('records labelled initial tableau, every pivot and final tableau per phase', () => {
    const { trace } = solveSimplex(problem);
    for (const phase of trace.phases) {
      expect(phase.initial.columns).toEqual(phase.final.columns);
      expect(phase.initial.rowLabels).toEqual(['a', 'b']);
      if (phase.phase === 1) expect(phase.pivots.length).toBeGreaterThan(0);
      phase.pivots.forEach((pivot, i) => {
        expect(pivot.phase).toBe(phase.phase);
        expect(pivot.iteration).toBe(i + 1);
        expect(phase.initial.columns).toContain(pivot.entering);
        expect(phase.initial.columns).toContain(pivot.leaving);
        expect(pivot.tableau.basis[pivot.pivotRow]).toBe(pivot.entering);
        expect(pivot.tableau.columns[pivot.pivotColumn]).toBe(pivot.entering);
      });
      const last = phase.pivots[phase.pivots.length - 1];
      expect(last ? last.tableau : phase.initial).toEqual(phase.final);
    }
    expect(trace.phases[0]?.initial.columns).toEqual(['x', 'y', 'e1', 'e2', 'a1', 'a2']);
    expect(trace.phases[0]?.initial.basis).toEqual(['a1', 'a2']);
    expect(trace.phases[1]?.initial.columns).toEqual(['x', 'y', 'e1', 'e2']);
  });

  it('snapshots are independent copies', () => {
    const { trace } = solveSimplex(problem);
    const first = trace.phases[0];
    expect(first?.initial.rows).not.toBe(first?.final.rows);
    expect(first?.initial.rows[0]).not.toEqual(first?.final.rows[0]);
  });
});
