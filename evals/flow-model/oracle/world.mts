import { fieldsOf } from '../../../scripts/json/fields.mts';
import { domainOf, isTree } from '../model/inputs.mts';
import type {
  ArgSpec,
  Contracts,
  EffectContract,
  Outcome,
  RequireModule,
  SpecNode,
  TransitionContract,
} from '../model/contract-types.mts';
import type { Primitive } from '../model/syntax-types.mts';

type WorldEvent = {
  readonly callee: string;
  readonly entity: string;
  readonly to: string | undefined;
  readonly result: Outcome['result'];
};

export type World = {
  readonly contracts: Contracts;
  readonly assignment: ReadonlyMap<string, Primitive>;
  readonly choose: (count: number) => number;
  readonly exploreUnknown: boolean;
  readonly labels: WeakMap<object, string>;
  readonly persisted: Map<string, string | undefined>;
  readonly events: WorldEvent[];
  readonly trace: string[];
  readonly violations: Set<string>;
  readonly uninjected: string[];
};

type OracleCall = {
  readonly callee: string;
  readonly entity: string;
  readonly event: string | undefined;
  readonly to: string | undefined;
};

type Leaf = { readonly value: unknown };
type Injected = (...args: readonly unknown[]) => unknown;
type Expanded = Outcome & { readonly applied: boolean };

function effectTable(world: World): Readonly<Record<string, EffectContract>> {
  const { effects } = world.contracts;
  if (effects === undefined) {
    throw new Error('oracle: the contracts define no effects');
  }
  return effects;
}

function concreteLabel(world: World, value: unknown): string {
  const fields = fieldsOf(value);
  if (fields !== undefined) {
    return world.labels.get(fields) ?? '<object>';
  }
  if (typeof value === 'function') {
    return world.labels.get(value) ?? '<object>';
  }
  return String(value);
}

function specValue(args: readonly unknown[], spec: ArgSpec): unknown {
  const value = args[spec.arg];
  if (spec.field === undefined) {
    return value;
  }
  return value === undefined || value === null ? undefined : Reflect.get(Object(value), spec.field);
}

function expandOutcomes(outcomes: readonly Outcome[]): Expanded[] {
  return outcomes.flatMap((outcome): Expanded[] =>
    outcome.result === 'ambiguous'
      ? [
          { ...outcome, applied: true },
          { ...outcome, applied: false },
        ]
      : [{ ...outcome, applied: outcome.result === 'success' }],
  );
}

function checkPrerequisites(world: World, call: OracleCall): void {
  for (const rule of world.contracts.prerequisites ?? []) {
    const applies =
      rule.effect === call.callee && (rule.event === undefined || rule.event === call.event);
    const satisfied = world.events.some(
      (event) =>
        event.callee === rule.requires.effect &&
        event.entity === call.entity &&
        event.result === 'success' &&
        (rule.requires.to === undefined || event.to === rule.requires.to),
    );
    if (applies && !satisfied) {
      world.violations.add([rule.id, call.callee, call.entity].join('|'));
    }
  }
}

function checkTransition(
  world: World,
  call: OracleCall,
  { transition, args }: { transition: TransitionContract; args: readonly unknown[] },
): void {
  const persisted = world.persisted.get(call.entity);
  const from = persisted ?? String(specValue(args, transition.from));
  const allowed = transition.allowed.some(
    ([source, target]) => source === from && target === call.to,
  );
  if (!allowed) {
    world.violations.add([transition.id, call.callee, call.entity, from, call.to].join('|'));
  }
}

function returned(outcome: Outcome): unknown {
  return outcome.returns === 'opaque' ? {} : outcome.returns;
}

function callOf(
  world: World,
  {
    name,
    contract,
    transition,
    args,
  }: {
    name: string;
    contract: EffectContract;
    transition: TransitionContract | undefined;
    args: readonly unknown[];
  },
): OracleCall {
  function label(spec: ArgSpec): string {
    return concreteLabel(world, specValue(args, spec));
  }
  return {
    callee: name,
    entity: label(contract.entity),
    event: contract.event === undefined ? undefined : label(contract.event),
    to: transition === undefined ? undefined : label(transition.to),
  };
}

function effect(world: World, name: string): Injected {
  const contract = effectTable(world)[name];
  if (contract === undefined) {
    throw new Error(`oracle: no contract for effect ${name}`);
  }
  const transition = (world.contracts.transitions ?? []).find((item) => item.effect === name);
  return function recordEffect(...args) {
    const call = callOf(world, { name, contract, transition, args });
    checkPrerequisites(world, call);
    if (transition !== undefined) {
      checkTransition(world, call, { transition, args });
    }
    const options = expandOutcomes(contract.outcomes);
    const outcome = options[world.choose(options.length)];
    if (outcome === undefined) {
      throw new Error(`oracle: effect ${name} has no outcome to choose`);
    }
    if (transition !== undefined && outcome.applied) {
      world.persisted.set(call.entity, call.to);
    }
    world.events.push({ callee: name, entity: call.entity, to: call.to, result: outcome.result });
    world.trace.push(`${name}:${outcome.name}`);
    if (outcome.result !== 'success') {
      throw new Error(`${name} ${outcome.name}`);
    }
    return returned(outcome);
  };
}

function unknownFunction(world: World, name: string): Injected {
  return function unknown() {
    if (!world.exploreUnknown) {
      world.uninjected.push(name);
      throw new Error(`oracle: ${name} is not injected`);
    }
    world.trace.push(`${name}:unknown`);
    if (world.choose(2) === 1) {
      throw new Error(`${name} failed`);
    }
    return undefined;
  };
}

function receiver(world: World, name: string): Record<string, Injected> {
  const methods: Record<string, Injected> = {};
  const prefix = `${name}.`;
  for (const effectName of Object.keys(effectTable(world))) {
    if (effectName.startsWith(prefix)) {
      methods[effectName.slice(prefix.length)] = effect(world, effectName);
    }
  }
  world.labels.set(methods, name);
  return methods;
}

function leafInput(world: World, spec: SpecNode, path: string): Leaf | undefined {
  if (spec === 'effects') {
    return { value: receiver(world, path) };
  }
  if (domainOf(spec) !== undefined) {
    return { value: world.assignment.get(path) };
  }
  return spec !== 'object' && !isTree(spec) ? { value: spec } : undefined;
}

export function buildInput(world: World, spec: SpecNode, path: string): unknown {
  const leaf = leafInput(world, spec, path);
  if (leaf !== undefined) {
    return leaf.value;
  }
  const root: Record<string, unknown> = {};
  const pending = [{ spec, path, object: root }];
  for (const item of pending) {
    world.labels.set(item.object, item.path);
    const entries = isTree(item.spec) ? Object.entries(item.spec) : [];
    for (const [key, child] of entries) {
      const childPath = `${item.path}.${key}`;
      const childLeaf = leafInput(world, child, childPath);
      if (childLeaf !== undefined) {
        item.object[key] = childLeaf.value;
        continue;
      }
      const object: Record<string, unknown> = {};
      item.object[key] = object;
      pending.push({ spec: child, path: childPath, object });
    }
  }
  return root;
}

export function requireFor(world: World): RequireModule {
  return function requireModule(specifier) {
    return new Proxy(
      {},
      {
        get(_target, name) {
          const key = `${specifier}#${String(name)}`;
          return Object.hasOwn(effectTable(world), key)
            ? effect(world, key)
            : unknownFunction(world, key);
        },
      },
    );
  };
}

export function createWorld({
  contracts,
  assignment,
  choose,
  exploreUnknown,
}: {
  contracts: Contracts;
  assignment: ReadonlyMap<string, Primitive>;
  choose: (count: number) => number;
  exploreUnknown: boolean;
}): World {
  return {
    contracts,
    assignment,
    choose,
    exploreUnknown,
    labels: new WeakMap(),
    persisted: new Map(),
    events: [],
    trace: [],
    violations: new Set(),
    uninjected: [],
  };
}
