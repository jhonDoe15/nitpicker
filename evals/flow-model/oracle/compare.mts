import type { OracleRun } from '../model/contract-types.mts';
import type { AnalysisPath, AnalysisResult } from '../model/run-types.mts';

const WILDCARD = '?';

type Observed = {
  readonly violations: ReadonlySet<string>;
  readonly traces: ReadonlySet<string>;
  readonly uninjected: readonly string[];
};

type Mismatches = {
  readonly violationsOnlyStatic?: readonly string[];
  readonly violationsOnlyObserved?: readonly string[];
  readonly tracesOnlyStatic?: readonly string[];
  readonly tracesOnlyObserved?: readonly string[];
};

export type Comparison =
  | {
      readonly mode: 'unsupported';
      readonly agree: false;
      readonly executions: 0;
      readonly unsupported: string;
    }
  | ({
      readonly mode: 'exact' | 'subset';
      readonly agree: boolean;
      readonly executions: number;
      readonly exhausted: boolean;
      readonly uninjected: readonly string[];
      readonly observedViolations: readonly string[];
    } & Mismatches);

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort();
}

function staticTrace(path: AnalysisPath): string {
  const events = path.events.map((event) => `${event.callee}:${event.outcome}`);
  return `${events.join(' > ')} => ${path.completion}`;
}

function covers(staticObservation: string, observed: string): boolean {
  const expected = staticObservation.split('|');
  const actual = observed.split('|');
  return (
    expected.length === actual.length &&
    expected.every((part, index) => part === WILDCARD || part === actual[index])
  );
}

function observedOf(oracle: OracleRun): Observed {
  return {
    violations: new Set(oracle.executions.flatMap((execution) => execution.violations)),
    traces: new Set(oracle.executions.map((execution) => execution.trace)),
    uninjected: [...new Set(oracle.executions.flatMap((execution) => execution.uninjected))].sort(),
  };
}

function exactComparison(
  result: AnalysisResult,
  observed: Observed,
): { agree: boolean; mismatches: Mismatches } {
  const staticViolations = new Set(result.violations.map((violation) => violation.observation));
  const staticTraces = new Set(result.paths.map(staticTrace));
  const mismatches = {
    violationsOnlyStatic: difference(staticViolations, observed.violations),
    violationsOnlyObserved: difference(observed.violations, staticViolations),
    tracesOnlyStatic: difference(staticTraces, observed.traces),
    tracesOnlyObserved: difference(observed.traces, staticTraces),
  };
  const agree =
    Object.values(mismatches).every((items) => items.length === 0) &&
    observed.uninjected.length === 0;
  return { agree, mismatches };
}

function subsetComparison(
  result: AnalysisResult,
  observed: Observed,
): { agree: boolean; mismatches: Mismatches } {
  const reported = result.violations.map((violation) => violation.observation);
  const unreported = [...observed.violations]
    .filter((item) => !reported.some((candidate) => covers(candidate, item)))
    .sort();
  return { agree: unreported.length === 0, mismatches: { violationsOnlyObserved: unreported } };
}

export function compareWithOracle(result: AnalysisResult, oracle: OracleRun): Comparison {
  if (oracle.unsupported !== undefined) {
    return { mode: 'unsupported', agree: false, executions: 0, unsupported: oracle.unsupported };
  }
  const observed = observedOf(oracle);
  const mode = result.status === 'complete' ? 'exact' : 'subset';
  const { agree, mismatches } =
    mode === 'exact' ? exactComparison(result, observed) : subsetComparison(result, observed);
  return {
    mode,
    agree: agree && !oracle.exhausted,
    executions: oracle.executions.length,
    exhausted: oracle.exhausted,
    uninjected: observed.uninjected,
    observedViolations: [...observed.violations].sort(),
    ...mismatches,
  };
}
