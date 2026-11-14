import { callHelper, runBody } from './check/execute.mts';
import { addPartial, createState } from './check/state.mts';
import { inputOf, labelOf } from './check/values.mts';
import { extractModel } from './extract/extract.mts';
import { functionNamed } from './model/functions.mts';
import type { Bounds, Contracts, Inputs, NormalizedContracts } from './model/contract-types.mts';
import type {
  Analysis,
  AnalysisPath,
  AnalysisResult,
  Completion,
  Reason,
  ReportedViolation,
  RunContext,
  State,
} from './model/run-types.mts';
import type { FlowModel, FunctionModel } from './model/syntax-types.mts';

export const DEFAULT_BOUNDS: Bounds = Object.freeze({ maxStates: 256, maxDepth: 4 });

function normalizeContracts(contracts: Contracts): NormalizedContracts {
  return {
    effects: contracts.effects ?? {},
    pure: contracts.pure ?? [],
    constructs: contracts.constructs ?? [],
    transitions: contracts.transitions ?? [],
    prerequisites: contracts.prerequisites ?? [],
  };
}

function compareReasons(left: Reason, right: Reason): number {
  return (
    left.line - right.line || left.column - right.column || left.reason.localeCompare(right.reason)
  );
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(keyOf(item))) {
      seen.set(keyOf(item), item);
    }
  }
  return [...seen.values()];
}

export function traceOf(path: Pick<AnalysisPath, 'events' | 'completion'>): string {
  const events = path.events.map((event) => `${event.callee}:${event.outcome}`);
  return `${events.join(' > ')} => ${path.completion}`;
}

function pathId(index: number): string {
  return `p${String(index + 1)}`;
}

function pathOf(result: Completion, index: number): AnalysisPath {
  const { state } = result;
  return {
    id: pathId(index),
    completion: result.completion === 'normal' ? 'return' : result.completion,
    value: labelOf(state, result.value),
    guards: state.guards,
    events: state.events,
    violations: state.violations.map((violation) => violation.signature),
    partial: state.partial,
  };
}

function violationsOf(finals: readonly Completion[]): ReportedViolation[] {
  const all = finals.flatMap((result, index) =>
    result.state.violations.map((violation) => ({ ...violation, path: pathId(index) })),
  );
  return uniqueBy(all, (violation) => violation.signature).map((violation) => {
    const definite = all.some(
      (item) => item.signature === violation.signature && item.certainty === 'definite',
    );
    return { ...violation, certainty: definite ? 'definite' : 'possible' };
  });
}

function reasonKey(item: Reason): string {
  return `${item.reason}|${String(item.line)}|${String(item.column)}`;
}

function summarize(finals: readonly Completion[], ctx: RunContext): AnalysisResult {
  const paths = finals.map(pathOf);
  const { maxStates } = ctx.bounds;
  const budget: Reason[] = ctx.budget.exhausted
    ? [{ reason: 'state-budget', line: 0, column: 0, detail: String(maxStates) }]
    : [];
  const partial = [...paths.flatMap((path) => path.partial), ...budget];
  const reasons = uniqueBy(partial, reasonKey).sort(compareReasons);
  return {
    status: reasons.length === 0 ? 'complete' : 'partial',
    reasons,
    violations: violationsOf(finals),
    paths,
    stats: { paths: paths.length, states: ctx.budget.created, maxStates },
  };
}

function entryChecks(seed: State, entry: FunctionModel, model: FlowModel): void {
  for (const param of entry.params.filter((item) => item.supported === false)) {
    const detail = `parameter ${param.name}`;
    addPartial(seed, { reason: 'unsupported-syntax', loc: entry.loc, detail });
  }
  if (entry.async === true || entry.generator === true) {
    addPartial(seed, { reason: 'async', loc: entry.loc, detail: entry.name });
  }
  for (const name of model.missingHelpers) {
    addPartial(seed, { reason: 'missing-semantics', loc: entry.loc, detail: name });
  }
}

function analyzeModel(
  model: FlowModel,
  { contracts, inputs, bounds }: { contracts: Contracts; inputs: Inputs; bounds: Partial<Bounds> },
): AnalysisResult {
  const ctx: RunContext = {
    model,
    contracts: normalizeContracts(contracts),
    inputs,
    bounds: { ...DEFAULT_BOUNDS, ...bounds },
    budget: { created: 1, exhausted: false },
    callHelper,
  };
  const entry = functionNamed(model, model.entry);
  const seed = createState({ fn: model.entry, args: [] }, ctx);
  seed.frame = { ...seed.frame, args: entry.params.map((param) => inputOf(seed, param.name)) };
  entryChecks(seed, entry, model);
  return summarize(runBody(seed, entry), ctx);
}

export function analyzeSource({
  file,
  text,
  entry,
  contracts,
  inputs = {},
  bounds = {},
}: {
  file: string;
  text: string;
  entry: string;
  contracts: Contracts;
  inputs?: Inputs;
  bounds?: Partial<Bounds> | undefined;
}): Analysis {
  const model = extractModel({ file, text, entry });
  const result = analyzeModel(model, { contracts, inputs, bounds });
  return { model, result };
}
