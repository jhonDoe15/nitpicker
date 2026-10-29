import { isRecord } from '../report/canonical.mjs';

function concreteLabel(world, value) {
  if (isRecord(value) || typeof value === 'function') {
    return world.labels.get(value) ?? '<object>';
  }
  return String(value);
}

function specValue(args, spec) {
  const value = args[spec.arg];
  return spec.field === undefined ? value : value?.[spec.field];
}

function expandOutcomes(outcomes) {
  return outcomes.flatMap((outcome) =>
    outcome.result === 'ambiguous'
      ? [
          { ...outcome, applied: true },
          { ...outcome, applied: false },
        ]
      : [{ ...outcome, applied: outcome.result === 'success' }],
  );
}

function checkPrerequisites(world, call) {
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

function checkTransition(world, call, args) {
  const persisted = world.persisted.get(call.entity);
  const from = persisted ?? String(specValue(args, call.transition.from));
  const allowed = call.transition.allowed.some(
    ([source, target]) => source === from && target === call.to,
  );
  if (!allowed) {
    world.violations.add([call.transition.id, call.callee, call.entity, from, call.to].join('|'));
  }
}

function returned(outcome) {
  return outcome.returns === 'opaque' ? {} : outcome.returns;
}

function callOf(world, { name, contract, transition, args }) {
  function label(spec) {
    return spec === undefined ? undefined : concreteLabel(world, specValue(args, spec));
  }
  return {
    callee: name,
    entity: label(contract.entity),
    event: label(contract.event),
    to: transition === undefined ? undefined : label(transition.to),
    transition,
  };
}

function effect(world, name) {
  const contract = world.contracts.effects[name];
  const transition = (world.contracts.transitions ?? []).find((item) => item.effect === name);
  return function recordEffect(...args) {
    const call = callOf(world, { name, contract, transition, args });
    checkPrerequisites(world, call);
    if (transition !== undefined) {
      checkTransition(world, call, args);
    }
    const options = expandOutcomes(contract.outcomes);
    const outcome = options[world.choose(options.length)];
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

function unknownFunction(world, name) {
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

function receiver(world, name) {
  const methods = {};
  const prefix = `${name}.`;
  for (const effectName of Object.keys(world.contracts.effects)) {
    if (effectName.startsWith(prefix)) {
      methods[effectName.slice(prefix.length)] = effect(world, effectName);
    }
  }
  world.labels.set(methods, name);
  return methods;
}

function leafInput(world, spec, path) {
  if (spec === 'effects') {
    return { value: receiver(world, path) };
  }
  if (isRecord(spec) && Array.isArray(spec.oneOf)) {
    return { value: world.assignment.get(path) };
  }
  return spec !== 'object' && !isRecord(spec) ? { value: spec } : undefined;
}

export function buildInput(world, spec, path) {
  const leaf = leafInput(world, spec, path);
  if (leaf !== undefined) {
    return leaf.value;
  }
  const root = {};
  const pending = [{ spec, path, object: root }];
  for (const item of pending) {
    world.labels.set(item.object, item.path);
    for (const [key, child] of Object.entries(item.spec === 'object' ? {} : item.spec)) {
      const childPath = `${item.path}.${key}`;
      const childLeaf = leafInput(world, child, childPath);
      item.object[key] = childLeaf === undefined ? {} : childLeaf.value;
      pending.push(
        ...(childLeaf === undefined
          ? [{ spec: child, path: childPath, object: item.object[key] }]
          : []),
      );
    }
  }
  return root;
}

export function requireFor(world) {
  return function requireModule(specifier) {
    return new Proxy(
      {},
      {
        get(_target, name) {
          const key = `${specifier}#${String(name)}`;
          return Object.hasOwn(world.contracts.effects, key)
            ? effect(world, key)
            : unknownFunction(world, key);
        },
      },
    );
  };
}

export function createWorld({ contracts, assignment, choose, exploreUnknown }) {
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
