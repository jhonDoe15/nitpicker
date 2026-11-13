import type {
  ArgSpec,
  EffectContract,
  NormalizedContracts,
  Outcome,
  TransitionContract,
} from '../model/contract-types.mts';
import type { EffectCall, Flow, State, Value, Violation } from '../model/run-types.mts';
import type { CallExpr, Loc, Primitive } from '../model/syntax-types.mts';
import { UNDEFINED, addPartial, alternatives, nextCall, stepOf, widen } from './state.mts';
import { getField, identityOf, isObjectLike, labelOf, possibleValues, resolve } from './values.mts';

type ViolationDetails = {
  readonly contract: string;
  readonly kind: 'prerequisite' | 'transition';
  readonly requires?: string;
  readonly from?: Primitive;
  readonly to?: string | undefined;
};

function argumentValue(state: State, args: readonly Value[], spec: ArgSpec): Value {
  const value = args[spec.arg] ?? UNDEFINED;
  return spec.field === undefined ? value : getField(state, value, spec.field);
}

function argumentLabel(
  state: State,
  { args, spec, loc }: { args: readonly Value[]; spec: ArgSpec; loc: Loc },
): string {
  const identity = identityOf(state, argumentValue(state, args, spec));
  if (identity === undefined) {
    addPartial(state, { reason: 'unknown-entity', loc, detail: `argument ${String(spec.arg)}` });
  }
  return identity ?? '?';
}

function recordViolation(state: State, call: EffectCall, details: ViolationDetails): void {
  const observation = [details.contract, call.callee, call.entity, details.from, details.to]
    .filter((part) => part !== undefined)
    .join('|');
  const certainty = state.partial.length === 0 ? 'definite' : 'possible';
  const witness = { guards: [...state.guards], events: [...state.events] };
  state.violations.push({
    signature: `${observation}@${call.site}`,
    observation,
    site: call.site,
    ...details,
    callee: call.callee,
    entity: call.entity,
    ...call.loc,
    certainty,
    witness,
  });
}

function checkPrerequisites(state: State, call: EffectCall): void {
  const rules = state.run.contracts.prerequisites.filter(
    (rule) =>
      rule.effect === call.callee && (rule.event === undefined || rule.event === call.event),
  );
  for (const rule of rules) {
    const satisfied =
      call.entity !== '?' &&
      state.events.some(
        (event) =>
          event.callee === rule.requires.effect &&
          event.entity === call.entity &&
          event.result === 'success' &&
          (rule.requires.to === undefined || event.to === rule.requires.to),
      );
    if (!satisfied) {
      const requires = [rule.requires.effect, rule.requires.to]
        .filter((part) => part !== undefined)
        .join(' to ');
      recordViolation(state, call, { contract: rule.id, kind: 'prerequisite', requires });
    }
  }
}

function currentStates(
  state: State,
  call: EffectCall,
  transition: TransitionContract,
): readonly Primitive[] | undefined {
  const record = state.entities.get(call.entity);
  if (record !== undefined) {
    return record.states;
  }
  const value = resolve(state, argumentValue(state, call.args, transition.from));
  if (value.t === 'lit') {
    return [value.v];
  }
  return value.t === 'atom' ? possibleValues(state, value) : undefined;
}

function checkTransition(
  state: State,
  call: EffectCall,
  transition: TransitionContract,
): readonly Primitive[] | undefined {
  const froms = currentStates(state, call, transition);
  if (froms === undefined) {
    addPartial(state, { reason: 'unknown-state', loc: call.loc, detail: call.entity });
    const details: ViolationDetails = {
      contract: transition.id,
      kind: 'transition',
      from: '?',
      to: call.to,
    };
    recordViolation(state, call, details);
    return undefined;
  }
  const allowed = new Set(transition.allowed.map(([from, to]) => `${from}->${to}`));
  for (const from of froms.filter((item) => !allowed.has(`${String(item)}->${String(call.to)}`))) {
    recordViolation(state, call, {
      contract: transition.id,
      kind: 'transition',
      from,
      to: call.to,
    });
  }
  return froms;
}

function returnedValue(outcome: Outcome, label: string): Value {
  if (outcome.returns === 'opaque') {
    return { t: 'opaque', label };
  }
  return outcome.returns === undefined ? UNDEFINED : { t: 'lit', v: outcome.returns };
}

function applyOutcome(
  state: State,
  call: EffectCall,
  { transition, froms, outcome }: Applied,
): Flow {
  state.events.push({
    callee: call.callee,
    entity: call.entity,
    outcome: outcome.name,
    result: outcome.result,
    ...(call.to === undefined ? {} : { to: call.to }),
    ...(call.event === undefined ? {} : { event: call.event }),
    ...call.loc,
    seq: stepOf(state),
  });
  const label = `${call.callee}#${String(nextCall(state))}`;
  if (transition !== undefined && froms !== undefined && outcome.result !== 'failure') {
    const states = outcome.result === 'success' ? [call.to] : [...new Set([...froms, call.to])];
    state.entities.set(call.entity, { states });
  }
  if (outcome.result === 'success') {
    return { state, value: returnedValue(outcome, label) };
  }
  return { state, thrown: { t: 'opaque', label: `error:${label}` } };
}

type Applied = {
  readonly transition: TransitionContract | undefined;
  readonly froms: readonly Primitive[] | undefined;
  readonly outcome: Outcome;
};

function sitePath(state: State, site: string): string {
  return [...(state.frame.sites ?? []), site].join(' > ');
}

function opaqueRules(
  contracts: NormalizedContracts,
): readonly { contract: string; callee: string; rest: readonly string[] }[] {
  return [
    ...contracts.prerequisites.map((rule) => ({
      contract: rule.id,
      callee: rule.effect,
      rest: ['?'],
    })),
    ...contracts.transitions.map((rule) => ({
      contract: rule.id,
      callee: rule.effect,
      rest: ['?', '?', '?'],
    })),
  ];
}

export function opaqueEffects(state: State, { loc, detail }: { loc: Loc; detail: string }): void {
  const site = sitePath(state, `${state.frame.fn}:unmodelled ${detail}`);
  const witness = { guards: [...state.guards], events: [...state.events] };
  for (const { contract, callee, rest } of opaqueRules(state.run.contracts)) {
    const observation = [contract, callee, ...rest].join('|');
    const violation: Violation = {
      signature: `${observation}@${site}`,
      observation,
      site,
      contract,
      kind: 'unmodelled',
      detail,
      callee,
      entity: '?',
      line: loc.line,
      column: loc.column,
      certainty: 'possible',
      witness,
    };
    state.violations.push(violation);
  }
}

export function effectCall(
  state: State,
  {
    name,
    contract,
    args,
    expr,
  }: { name: string; contract: EffectContract; args: readonly Value[]; expr: CallExpr },
): Flow[] {
  const { loc } = expr;
  const transition = state.run.contracts.transitions.find((item) => item.effect === name);
  const call: EffectCall = {
    callee: name,
    loc,
    site: sitePath(state, expr.site),
    args,
    entity: argumentLabel(state, { args, spec: contract.entity, loc }),
    event:
      contract.event === undefined
        ? undefined
        : argumentLabel(state, { args, spec: contract.event, loc }),
    to:
      transition === undefined
        ? undefined
        : argumentLabel(state, { args, spec: transition.to, loc }),
  };
  checkPrerequisites(state, call);
  const froms = transition === undefined ? undefined : checkTransition(state, call, transition);
  return alternatives(state, contract.outcomes).map(([next, outcome]) =>
    applyOutcome(next, call, { transition, froms, outcome }),
  );
}

export function unknownCall(
  state: State,
  {
    reason,
    loc,
    detail,
    args,
  }: { reason: string; loc: Loc; detail: string; args?: readonly Value[] },
): Flow[] {
  addPartial(state, { reason, loc, detail });
  widen(state);
  if (args === undefined || args.some((arg) => isObjectLike(resolve(state, arg)))) {
    state.mutated = true;
  }
  state.events.push({
    callee: detail,
    entity: '?',
    outcome: 'unknown',
    result: 'unknown',
    ...loc,
    seq: stepOf(state),
  });
  const label = `unknown#${String(nextCall(state))}`;
  return alternatives<'return' | 'throw'>(state, ['return', 'throw']).map(
    ([next, completion]): Flow =>
      completion === 'return'
        ? { state: next, value: { t: 'atom', key: label } }
        : { state: next, thrown: { t: 'atom', key: `error:${label}` } },
  );
}

export function pureCall(
  state: State,
  {
    name,
    args,
    constructs = false,
  }: { name: string; args: readonly Value[]; constructs?: boolean },
): Flow[] {
  if (constructs) {
    return [{ state, value: { t: 'opaque', label: `new ${name}#${String(nextCall(state))}` } }];
  }
  const labels = args.map((arg) => labelOf(state, arg)).join(', ');
  return [{ state, value: { t: 'atom', key: `${name}(${labels})` } }];
}
