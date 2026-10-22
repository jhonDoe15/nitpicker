import { callHelper, execBlock } from './execute.mjs';
import { addPartial, createState } from './state.mjs';
import { inputValue, labelOf } from './values.mjs';

export const DEFAULT_BOUNDS = Object.freeze({ maxStates: 256, maxDepth: 4 });

export function normalizeContracts(contracts) {
  return {
    effects: contracts.effects ?? {},
    pure: contracts.pure ?? [],
    transitions: contracts.transitions ?? [],
    prerequisites: contracts.prerequisites ?? [],
  };
}

function compareReasons(left, right) {
  return (
    left.line - right.line || left.column - right.column || left.reason.localeCompare(right.reason)
  );
}

function uniqueBy(items, keyOf) {
  const seen = new Map();
  for (const item of items) {
    if (!seen.has(keyOf(item))) {
      seen.set(keyOf(item), item);
    }
  }
  return [...seen.values()];
}

export function traceOf(path) {
  const events = path.events.map((event) => `${event.callee}:${event.outcome}`);
  return `${events.join(' > ')} => ${path.completion}`;
}

function pathOf(result, index) {
  const { state } = result;
  return {
    id: `p${String(index + 1)}`,
    completion: result.completion === 'normal' ? 'return' : result.completion,
    value: labelOf(state, result.value),
    guards: state.guards,
    events: state.events,
    violations: state.violations.map((violation) => violation.signature),
    partial: state.partial,
  };
}

function violationsOf(finals, paths) {
  const all = finals.flatMap((result, index) =>
    result.state.violations.map((violation) => ({ ...violation, path: paths[index].id })),
  );
  return uniqueBy(all, (violation) => violation.signature).map((violation) => {
    const definite = all.some(
      (item) => item.signature === violation.signature && item.certainty === 'definite',
    );
    return { ...violation, certainty: definite ? 'definite' : 'possible' };
  });
}

function summarize(finals, ctx) {
  const paths = finals.map(pathOf);
  const budget = ctx.budget.exhausted
    ? [{ reason: 'state-budget', line: 0, column: 0, detail: String(ctx.bounds.maxStates) }]
    : [];
  const partial = [...paths.flatMap((path) => path.partial), ...budget];
  const reasons = uniqueBy(
    partial,
    (item) => `${item.reason}|${String(item.line)}|${String(item.column)}`,
  ).sort(compareReasons);
  return {
    status: reasons.length === 0 ? 'complete' : 'partial',
    reasons,
    violations: violationsOf(finals, paths),
    paths,
    stats: { paths: paths.length, states: ctx.budget.created, maxStates: ctx.bounds.maxStates },
  };
}

export function analyzeModel(model, { contracts, inputs = {}, bounds = {} }) {
  const ctx = {
    model,
    contracts: normalizeContracts(contracts),
    inputs,
    bounds: { ...DEFAULT_BOUNDS, ...bounds },
    budget: { created: 1, exhausted: false },
    callHelper,
  };
  const entry = model.functions[model.entry];
  const seed = createState({ fn: model.entry, args: [] }, ctx);
  seed.frame.args = entry.params.map((param) => inputValue(inputs[param.name], param.name, seed));
  for (const param of entry.params.filter((item) => item.supported === false)) {
    addPartial(seed, {
      reason: 'unsupported-syntax',
      loc: entry.loc,
      detail: `parameter ${param.name}`,
    });
  }
  for (const name of model.missingHelpers) {
    addPartial(seed, { reason: 'missing-semantics', loc: entry.loc, detail: name });
  }
  return summarize(execBlock(entry.body, seed, ctx), ctx);
}
