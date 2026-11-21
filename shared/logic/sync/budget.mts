import type { SolverBudget } from '../typed/solver-types.mts';

const UNIT_SOLVER_CALLS = 300;

export function solverBudget(calls = UNIT_SOLVER_CALLS): SolverBudget {
  let left = calls;
  return {
    remaining: () => left,
    spend: () => {
      if (left <= 0) {
        return false;
      }
      left -= 1;
      return true;
    },
  };
}

export function spendRun(budget: SolverBudget | undefined): boolean {
  return budget === undefined || budget.spend();
}
