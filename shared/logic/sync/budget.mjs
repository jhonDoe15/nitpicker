const UNIT_SOLVER_CALLS = 300;

/**
 * A count of the solver runs one unit may start, shared by every question asked about it. When it
 * is spent the solver is not asked again and the answer is 'open'. A count, unlike a clock, gives
 * the same findings on every machine.
 */
export function solverBudget(calls = UNIT_SOLVER_CALLS) {
  return { left: calls };
}

export function spendRun(budget) {
  if (budget === undefined) {
    return true;
  }
  if (budget.left <= 0) {
    return false;
  }
  budget.left -= 1;
  return true;
}
