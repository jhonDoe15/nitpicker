import { compileEntry, parameterNames } from './compile.mjs';
import { buildInput, createWorld, requireFor } from './world.mjs';

export const DEFAULT_EXECUTION_LIMIT = 2000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function domainsOf(spec, path) {
  if (isRecord(spec) && Array.isArray(spec.oneOf)) {
    return [[path, spec.oneOf]];
  }
  return isRecord(spec)
    ? Object.entries(spec).flatMap(([key, value]) => domainsOf(value, `${path}.${key}`))
    : [];
}

function assignments(domains) {
  let combos = [new Map()];
  for (const [path, values] of domains) {
    combos = combos.flatMap((combo) => values.map((value) => new Map([...combo, [path, value]])));
  }
  return combos;
}

function chooser(prefix, choices) {
  return (count) => {
    const index = prefix[choices.length] ?? 0;
    choices.push({ index, count });
    return index;
  };
}

function execute(load, { contracts, params, inputs }, { assignment, prefix }) {
  const choices = [];
  const world = createWorld({ contracts, assignment, choose: chooser(prefix, choices) });
  const args = params.map((name) => buildInput(world, inputs[name], name));
  const entry = load(requireFor(world));
  let completion = 'return';
  try {
    entry(...args);
  } catch {
    completion = 'throw';
  }
  return {
    assignment: Object.fromEntries(assignment),
    trace: `${world.trace.join(' > ')} => ${completion}`,
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

export function runOracle({
  file,
  text,
  entry,
  contracts,
  inputs,
  limit = DEFAULT_EXECUTION_LIMIT,
}) {
  const load = compileEntry({ file, text, entry });
  const params = parameterNames({ file, text, entry });
  const run = { load, setup: { contracts, params, inputs }, executions: [], limit };
  const combos = assignments(params.flatMap((name) => domainsOf(inputs[name], name)));
  const finished = combos.every((assignment) => explore(run, assignment));
  return { executions: run.executions, exhausted: !finished };
}
