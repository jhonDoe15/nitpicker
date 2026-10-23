import { isRecord } from '../report/canonical.mjs';
import { compileEntry, entryShape } from './compile.mjs';
import { buildInput, createWorld, requireFor } from './world.mjs';

const DEFAULT_EXECUTION_LIMIT = 2000;

function domainsOf(spec, path) {
  const domains = [];
  const pending = [{ spec, path }];
  for (const item of pending) {
    if (isRecord(item.spec) && Array.isArray(item.spec.oneOf)) {
      domains.push([item.path, item.spec.oneOf]);
      continue;
    }
    const entries = isRecord(item.spec) ? Object.entries(item.spec) : [];
    pending.push(...entries.map(([key, value]) => ({ spec: value, path: `${item.path}.${key}` })));
  }
  return domains;
}

function assignments(domains) {
  let combos = [new Map()];
  for (const [path, values] of domains) {
    combos = combos.flatMap((combo) => values.map((value) => new Map([...combo, [path, value]])));
  }
  return combos;
}

function chooser(prefix, choices) {
  return function choose(count) {
    const index = prefix[choices.length] ?? 0;
    choices.push({ index, count });
    return index;
  };
}

function completionOf(entry, args) {
  try {
    entry(...args);
    return { completion: 'return', thrown: '' };
  } catch (error) {
    return { completion: 'throw', thrown: error instanceof Error ? error.message : String(error) };
  }
}

function execute(load, setup, { assignment, prefix }) {
  const { contracts, params, inputs, exploreUnknown } = setup;
  const choices = [];
  const choose = chooser(prefix, choices);
  const world = createWorld({ contracts, assignment, choose, exploreUnknown });
  const args = params.map((name) => buildInput(world, inputs[name], name));
  const { completion, thrown } = completionOf(load(requireFor(world)), args);
  return {
    assignment: Object.fromEntries(assignment),
    trace: `${world.trace.join(' > ')} => ${completion}`,
    thrown,
    violations: [...world.violations].sort(),
    uninjected: world.uninjected,
    choices,
  };
}

function successors(execution, prefix) {
  const taken = execution.choices.map((choice) => choice.index);
  const next = [];
  for (const [position, choice] of execution.choices.entries()) {
    const alternatives = Array.from({ length: choice.count }, (_, index) => index).filter(
      (index) => index > 0,
    );
    const open = position >= prefix.length;
    next.push(...(open ? alternatives.map((index) => [...taken.slice(0, position), index]) : []));
  }
  return next;
}

function explore(run, assignment) {
  const queue = [[]];
  for (const prefix of queue) {
    if (run.executions.length >= run.limit) {
      return false;
    }
    const execution = execute(run.load, run.setup, { assignment, prefix });
    run.executions.push(execution);
    queue.push(...successors(execution, prefix));
  }
  return true;
}

export function runOracle(options) {
  const { file, text, entry, contracts, inputs, limit = DEFAULT_EXECUTION_LIMIT } = options;
  const { params, async } = entryShape({ file, text, entry });
  if (async) {
    return { executions: [], exhausted: false, unsupported: 'async' };
  }
  const load = compileEntry({ file, text, entry });
  const exploreUnknown = options.exploreUnknown === true;
  const setup = { contracts, params, inputs, exploreUnknown };
  const run = { load, setup, executions: [], limit };
  const combos = assignments(params.flatMap((name) => domainsOf(inputs[name], name)));
  const finished = combos.every((assignment) => explore(run, assignment));
  return { executions: run.executions, exhausted: !finished };
}
