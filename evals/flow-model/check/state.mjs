export const UNDEFINED = Object.freeze({ t: 'undef' });

export function createState(frame, run) {
  return {
    run,
    frame,
    stack: [frame.fn],
    env: new Map(),
    facts: new Map(),
    fields: new Map(),
    entities: new Map(),
    events: [],
    guards: [],
    violations: [],
    partial: [],
    epoch: 0,
    calls: 0,
  };
}

function cloneState(state) {
  return {
    ...state,
    stack: [...state.stack],
    env: new Map(state.env),
    facts: new Map(state.facts),
    fields: new Map(state.fields),
    entities: new Map(state.entities),
    events: [...state.events],
    guards: [...state.guards],
    violations: [...state.violations],
    partial: [...state.partial],
  };
}

export function alternatives(state, options) {
  const ctx = state.run;
  if (options.length <= 1) {
    return options.map((option) => [state, option]);
  }
  const extra = options.length - 1;
  if (ctx.budget.created + extra > ctx.bounds.maxStates) {
    ctx.budget.exhausted = true;
    return [[state, options[0]]];
  }
  ctx.budget.created += extra;
  return options.map((option, index) => [index === 0 ? state : cloneState(state), option]);
}

export function addPartial(state, { reason, loc, detail }) {
  state.partial.push({ reason, line: loc?.line ?? 0, column: loc?.column ?? 0, detail });
}

export function widen(state) {
  state.epoch += 1;
  state.fields.clear();
  state.entities.clear();
}

export function stepOf(state) {
  return state.guards.length + state.events.length + 1;
}

export function nextCall(state) {
  state.calls += 1;
  return state.calls;
}

function clobberOne(state, target) {
  const value = { t: 'atom', key: `clobbered:${target}#${String(nextCall(state))}` };
  const separator = target.indexOf(':');
  const name = target.slice(separator + 1);
  if (target.startsWith('local:')) {
    state.env.set(name, value);
    return;
  }
  const args = [...state.frame.args];
  args[Number(name)] = value;
  state.frame = { ...state.frame, args };
}

export function mutate(state, { reason = 'unsupported-syntax', clobbers, loc, syntax }) {
  addPartial(state, { reason, loc, detail: syntax });
  widen(state);
  for (const target of clobbers) {
    clobberOne(state, target);
  }
}
