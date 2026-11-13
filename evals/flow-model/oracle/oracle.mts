import { domainOf, isTree } from '../model/inputs.mts';
import type {
  Contracts,
  EntryFunction,
  Inputs,
  OracleChoice,
  OracleExecution,
  OracleOptions,
  OracleRun,
  RequireModule,
  SpecNode,
} from '../model/contract-types.mts';
import type { Primitive } from '../model/syntax-types.mts';
import { compileEntry, entryShape } from './compile.mts';
import { buildInput, createWorld, requireFor } from './world.mts';

const DEFAULT_EXECUTION_LIMIT = 2000;

type Assignment = ReadonlyMap<string, Primitive>;
type Domain = readonly [string, readonly Primitive[]];
type Setup = {
  readonly contracts: Contracts;
  readonly params: readonly string[];
  readonly inputs: Inputs;
  readonly exploreUnknown: boolean;
};
type Run = {
  readonly load: (requireModule: RequireModule) => EntryFunction;
  readonly setup: Setup;
  readonly executions: OracleExecution[];
  readonly limit: number;
};

function domainsOf(spec: SpecNode, path: string): Domain[] {
  const domains: Domain[] = [];
  const pending = [{ spec, path }];
  for (const item of pending) {
    const domain = domainOf(item.spec);
    if (domain !== undefined) {
      domains.push([item.path, domain]);
      continue;
    }
    const entries = isTree(item.spec) ? Object.entries(item.spec) : [];
    pending.push(...entries.map(([key, value]) => ({ spec: value, path: `${item.path}.${key}` })));
  }
  return domains;
}

function assignments(domains: readonly Domain[]): Assignment[] {
  let combos: Assignment[] = [new Map()];
  for (const [path, values] of domains) {
    combos = combos.flatMap((combo) => values.map((value) => new Map([...combo, [path, value]])));
  }
  return combos;
}

function chooser(prefix: readonly number[], choices: OracleChoice[]): (count: number) => number {
  return function choose(count) {
    const index = prefix[choices.length] ?? 0;
    choices.push({ index, count });
    return index;
  };
}

function completionOf(
  entry: EntryFunction,
  args: readonly unknown[],
): { completion: 'return' | 'throw'; thrown: string } {
  try {
    entry(...args);
    return { completion: 'return', thrown: '' };
  } catch (error) {
    return { completion: 'throw', thrown: error instanceof Error ? error.message : String(error) };
  }
}

function execute(
  load: Run['load'],
  setup: Setup,
  { assignment, prefix }: { assignment: Assignment; prefix: readonly number[] },
): OracleExecution {
  const { contracts, params, inputs, exploreUnknown } = setup;
  const choices: OracleChoice[] = [];
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

function successors(execution: OracleExecution, prefix: readonly number[]): number[][] {
  const taken = execution.choices.map((choice) => choice.index);
  const next: number[][] = [];
  for (const [position, choice] of execution.choices.entries()) {
    const alternatives = Array.from({ length: choice.count }, (_, index) => index).filter(
      (index) => index > 0,
    );
    const open = position >= prefix.length;
    next.push(...(open ? alternatives.map((index) => [...taken.slice(0, position), index]) : []));
  }
  return next;
}

function explore(run: Run, assignment: Assignment): boolean {
  const queue: number[][] = [[]];
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

export function runOracle(options: OracleOptions): OracleRun {
  const { file, text, entry, contracts, inputs, limit = DEFAULT_EXECUTION_LIMIT } = options;
  const { params, async } = entryShape({ file, text, entry });
  if (async) {
    return { executions: [], exhausted: false, unsupported: 'async' };
  }
  const load = compileEntry({ file, text, entry });
  const exploreUnknown = options.exploreUnknown === true;
  const setup = { contracts, params, inputs, exploreUnknown };
  const run: Run = { load, setup, executions: [], limit };
  const combos = assignments(params.flatMap((name) => domainsOf(inputs[name], name)));
  const finished = combos.every((assignment) => explore(run, assignment));
  return { executions: run.executions, exhausted: !finished };
}
