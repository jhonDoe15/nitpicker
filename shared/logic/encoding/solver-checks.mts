import type { Z3, Z3Bool, Z3Solver } from '../typed/solver-types.mts';
import type { CheckSatResult } from 'z3-solver';

export function solverOf(z3: Z3, assertions: readonly Z3Bool[], resourceLimit: number): Z3Solver {
  const solver = new z3.Solver();
  solver.set('rlimit', resourceLimit);
  solver.add(...assertions);
  return solver;
}

export async function released<Result>(
  solver: Z3Solver,
  read: (result: CheckSatResult) => Result,
): Promise<Result> {
  try {
    return read(await solver.check());
  } finally {
    solver.release();
  }
}

export function satisfiable(
  z3: Z3,
  assertions: readonly Z3Bool[],
  resourceLimit: number,
): Promise<CheckSatResult> {
  return released(solverOf(z3, assertions, resourceLimit), (result) => result);
}
