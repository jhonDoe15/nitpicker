import { traceOf } from '../check/analyze.mjs';

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

export function compareWithOracle(result, oracle) {
  const staticViolations = new Set(result.violations.map((violation) => violation.signature));
  const observedViolations = new Set(
    oracle.executions.flatMap((execution) => execution.violations),
  );
  const staticTraces = new Set(result.paths.map(traceOf));
  const observedTraces = new Set(oracle.executions.map((execution) => execution.trace));
  const uninjected = [
    ...new Set(oracle.executions.flatMap((execution) => execution.uninjected)),
  ].sort();
  const mismatches = {
    violationsOnlyStatic: difference(staticViolations, observedViolations),
    violationsOnlyObserved: difference(observedViolations, staticViolations),
    tracesOnlyStatic: difference(staticTraces, observedTraces),
    tracesOnlyObserved: difference(observedTraces, staticTraces),
  };
  const agree =
    Object.values(mismatches).every((items) => items.length === 0) && uninjected.length === 0;
  return {
    agree: agree && !oracle.exhausted,
    executions: oracle.executions.length,
    exhausted: oracle.exhausted,
    uninjected,
    observedViolations: [...observedViolations].sort(),
    ...mismatches,
  };
}
