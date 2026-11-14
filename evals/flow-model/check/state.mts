import type { Fork, Frame, Reason, RunContext, State, Value } from '../model/run-types.mts';
import type { Loc, Unsupported } from '../model/syntax-types.mts';

export const UNDEFINED: Value = Object.freeze<Value>({ t: 'undef' });

export function createState(frame: Frame, run: RunContext): State {
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
    mutated: false,
  };
}

function cloneState(state: State): State {
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

export function alternatives<T>(state: State, options: readonly T[]): Fork<T> {
  const ctx = state.run;
  if (options.length <= 1) {
    return options.map((option) => [state, option]);
  }
  const extra = options.length - 1;
  if (ctx.budget.created + extra > ctx.bounds.maxStates) {
    ctx.budget.exhausted = true;
    return options.slice(0, 1).map((option) => [state, option]);
  }
  ctx.budget.created += extra;
  return options.map((option, index) => [index === 0 ? state : cloneState(state), option]);
}

export function addPartial(
  state: State,
  { reason, loc, detail }: { reason: string; loc: Loc | undefined; detail: string },
): void {
  const partial: Reason = { reason, line: loc?.line ?? 0, column: loc?.column ?? 0, detail };
  state.partial.push(partial);
}

export function widen(state: State): void {
  state.epoch += 1;
  state.fields.clear();
  state.entities.clear();
}

export function stepOf(state: State): number {
  return state.guards.length + state.events.length + 1;
}

export function nextCall(state: State): number {
  state.calls += 1;
  return state.calls;
}

function clobberOne(state: State, target: string): void {
  const value: Value = { t: 'atom', key: `clobbered:${target}#${String(nextCall(state))}` };
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

export function mutate(
  state: State,
  {
    reason = 'unsupported-syntax',
    region,
    loc,
    syntax,
  }: { reason?: string; region: Unsupported; loc: Loc; syntax: string },
): void {
  addPartial(state, { reason, loc, detail: syntax });
  if (region.writesFields === true || region.hasCall) {
    widen(state);
    state.mutated = true;
  }
  for (const target of region.clobbers) {
    clobberOne(state, target);
  }
}
