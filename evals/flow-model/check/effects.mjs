import { UNDEFINED, addPartial, alternatives, nextCall, stepOf, widen } from './state.mjs';
import { getField, labelOf, possibleValues, resolve } from './values.mjs';

function argumentValue(state, args, spec) {
  const value = args[spec.arg] ?? UNDEFINED;
  return spec.field === undefined ? value : getField(state, value, spec.field);
}

function argumentLabel(state, args, spec) {
  return spec === undefined ? undefined : labelOf(state, argumentValue(state, args, spec));
}

function recordViolation(state, call, details) {
  const signature = [details.contract, call.callee, call.entity, details.from, details.to]
    .filter((part) => part !== undefined)
    .join('|');
  const certainty = state.partial.length === 0 ? 'definite' : 'possible';
  const witness = { guards: [...state.guards], events: [...state.events] };
  state.violations.push({
    signature,
    ...details,
    callee: call.callee,
    entity: call.entity,
    ...call.loc,
    certainty,
    witness,
  });
}

function checkPrerequisites(state, call) {
  const rules = state.run.contracts.prerequisites.filter(
    (rule) =>
      rule.effect === call.callee && (rule.event === undefined || rule.event === call.event),
  );
  for (const rule of rules) {
    const satisfied = state.events.some(
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

function currentStates(state, call) {
  const record = state.entities.get(call.entity);
  if (record !== undefined) {
    return record.states;
  }
  const value = resolve(state, argumentValue(state, call.args, call.transition.from));
  if (value.t === 'lit') {
    return [value.v];
  }
  return value.t === 'atom' ? possibleValues(state, value) : undefined;
}

function checkTransition(state, call) {
  const froms = currentStates(state, call);
  if (froms === undefined) {
    addPartial(state, { reason: 'unknown-state', loc: call.loc, detail: call.entity });
    return undefined;
  }
  const allowed = new Set(call.transition.allowed.map(([from, to]) => `${from}->${to}`));
  for (const from of froms.filter((item) => !allowed.has(`${item}->${call.to}`))) {
    recordViolation(state, call, {
      contract: call.transition.id,
      kind: 'transition',
      from,
      to: call.to,
    });
  }
  return froms;
}

function returnedValue(outcome, label) {
  if (outcome.returns === 'opaque') {
    return { t: 'opaque', label };
  }
  return outcome.returns === undefined ? UNDEFINED : { t: 'lit', v: outcome.returns };
}

function applyOutcome(state, call, outcome) {
  const { froms } = call;
  const event = {
    callee: call.callee,
    entity: call.entity,
    outcome: outcome.name,
    result: outcome.result,
  };
  const extra = {
    ...(call.to === undefined ? {} : { to: call.to }),
    ...(call.event === undefined ? {} : { event: call.event }),
  };
  state.events.push({ ...event, ...extra, ...call.loc, seq: stepOf(state) });
  const label = `${call.callee}#${String(nextCall(state))}`;
  if (call.transition !== undefined && froms !== undefined && outcome.result !== 'failure') {
    const states = outcome.result === 'success' ? [call.to] : [...new Set([...froms, call.to])];
    state.entities.set(call.entity, { states });
  }
  if (outcome.result === 'success') {
    return { state, value: returnedValue(outcome, label) };
  }
  return { state, thrown: { t: 'opaque', label: `error:${label}` } };
}

export function effectCall(state, { name, contract, args, loc }) {
  const transition = state.run.contracts.transitions.find((item) => item.effect === name);
  const call = {
    callee: name,
    loc,
    args,
    transition,
    entity: argumentLabel(state, args, contract.entity),
    event: argumentLabel(state, args, contract.event),
    to: transition === undefined ? undefined : argumentLabel(state, args, transition.to),
  };
  checkPrerequisites(state, call);
  call.froms = transition === undefined ? undefined : checkTransition(state, call);
  return alternatives(state, contract.outcomes).map(([next, outcome]) =>
    applyOutcome(next, call, outcome),
  );
}

export function unknownCall(state, { reason, loc, detail }) {
  addPartial(state, { reason, loc, detail });
  widen(state);
  state.events.push({
    callee: detail,
    entity: '?',
    outcome: 'unknown',
    result: 'unknown',
    ...loc,
    seq: stepOf(state),
  });
  const label = `unknown#${String(nextCall(state))}`;
  return alternatives(state, ['return', 'throw']).map(([next, completion]) =>
    completion === 'return'
      ? { state: next, value: { t: 'atom', key: label } }
      : { state: next, thrown: { t: 'opaque', label: `error:${label}` } },
  );
}

export function pureCall(state, { name, args, constructs }) {
  if (constructs) {
    return [{ state, value: { t: 'opaque', label: `new ${name}#${String(nextCall(state))}` } }];
  }
  const labels = args.map((arg) => labelOf(state, arg)).join(', ');
  return [{ state, value: { t: 'atom', key: `${name}(${labels})` } }];
}
