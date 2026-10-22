function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function checkCall(world, call, args) {
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
  if (call.transition === undefined) {
    return;
  }
  const persisted = world.persisted.get(call.entity);
  const from = persisted === undefined ? String(specValue(args, call.transition.from)) : persisted;
  const allowed = call.transition.allowed.some(
    ([source, target]) => source === from && target === call.to,
  );
  if (!allowed) {
    world.violations.add([call.transition.id, call.callee, call.entity, from, call.to].join('|'));
  }
  call.from = from;
}

function returned(outcome) {
  return outcome.returns === 'opaque' ? {} : outcome.returns;
}

function effect(world, name) {
  const contract = world.contracts.effects[name];
  const transition = (world.contracts.transitions ?? []).find((item) => item.effect === name);
  return (...args) => {
    const label = (spec) =>
      spec === undefined ? undefined : concreteLabel(world, specValue(args, spec));
    const call = {
      callee: name,
      entity: label(contract.entity),
      event: label(contract.event),
      transition,
    };
    call.to = transition === undefined ? undefined : label(transition.to);
    checkCall(world, call, args);
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

function receiver(world, name) {
  const methods = {};
  for (const effectName of Object.keys(world.contracts.effects).filter((key) =>
    key.startsWith(`${name}.`),
  )) {
    methods[effectName.slice(name.length + 1)] = effect(world, effectName);
  }
  world.labels.set(methods, name);
  return methods;
}

export function buildInput(world, spec, path) {
  if (spec === 'effects') {
    return receiver(world, path);
  }
  if (isRecord(spec) && Array.isArray(spec.oneOf)) {
    return world.assignment.get(path);
  }
  if (spec !== 'object' && !isRecord(spec)) {
    return spec;
  }
  const object = {};
  for (const [key, value] of Object.entries(spec === 'object' ? {} : spec)) {
    object[key] = buildInput(world, value, `${path}.${key}`);
  }
  world.labels.set(object, path);
  return object;
}

export function requireFor(world) {
  return () =>
    new Proxy(
      {},
      {
        get(_target, name) {
          if (typeof name === 'string' && world.contracts.effects[name] !== undefined) {
            return effect(world, name);
          }
          return () => {
            world.uninjected.push(String(name));
            throw new Error(`oracle: ${String(name)} is not injected`);
          };
        },
      },
    );
}

export function createWorld({ contracts, assignment, choose }) {
  return {
    contracts,
    assignment,
    choose,
    labels: new WeakMap(),
    persisted: new Map(),
    events: [],
    trace: [],
    violations: new Set(),
    uninjected: [],
  };
}
