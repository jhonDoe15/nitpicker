import { opaqueEffects, unknownCall } from './effects.mjs';
import { chain, evalExpr, testValue } from './evaluate.mjs';
import { UNDEFINED, addPartial, mutate, nextCall, stepOf } from './state.mjs';
import { getField, resolve } from './values.mjs';

const UNSUPPORTED_REASONS = new Map([['loop', 'loop']]);

function normal(results) {
  return results.map((result) =>
    'thrown' in result
      ? { state: result.state, completion: 'throw', value: result.thrown }
      : { state: result.state, completion: 'normal', value: UNDEFINED },
  );
}

function execBind(stmt, state, ctx) {
  return normal(
    chain(evalExpr(stmt.value, state, ctx), (next, value) => {
      next.env.set(stmt.id, value);
      return [{ state: next, value }];
    }),
  );
}

function execSet(stmt, state, ctx) {
  return normal(
    chain(evalExpr(stmt.object, state, ctx), (current, object) =>
      chain(evalExpr(stmt.value, current, ctx), (next, value) => {
        const base = { input: object.path, obj: object.id }[object.t];
        if (base === undefined) {
          addPartial(next, { reason: 'unsupported-syntax', loc: stmt.loc, detail: 'mutation' });
        } else {
          next.fields.set(`${base}.${stmt.field}`, value);
        }
        return [{ state: next, value }];
      }),
    ),
  );
}

function execIf(stmt, state, ctx) {
  const tested = testValue(stmt.test, state, stmt.testLoc);
  return tested.flatMap((result) =>
    'thrown' in result
      ? normal([result])
      : execBlock(result.value ? stmt.then : stmt.else, result.state, ctx),
  );
}

function execCompletion(stmt, state, ctx) {
  return evalExpr(stmt.value, state, ctx).map((result) =>
    'thrown' in result
      ? { state: result.state, completion: 'throw', value: result.thrown }
      : { state: result.state, completion: stmt.kind, value: result.value },
  );
}

function execTry(stmt, state, ctx) {
  return execBlock(stmt.body, state, ctx).flatMap((result) => {
    if (result.completion !== 'throw') {
      return [result];
    }
    if (stmt.catchId !== undefined) {
      result.state.env.set(stmt.catchId, result.value);
    }
    for (const [id, field] of stmt.catchFields ?? []) {
      result.state.env.set(id, getField(result.state, result.value, field));
    }
    const { line, column } = stmt.loc;
    result.state.guards.push({
      text: 'catch',
      value: true,
      line,
      column,
      seq: stepOf(result.state),
    });
    return execBlock(stmt.handler, result.state, ctx);
  });
}

function execUnsupported(stmt, state) {
  const reason = UNSUPPORTED_REASONS.get(stmt.syntax) ?? 'unsupported-syntax';
  mutate(state, { reason, region: stmt, loc: stmt.loc, syntax: stmt.syntax });
  if (stmt.hasCall) {
    opaqueEffects(state, { loc: stmt.loc, detail: stmt.syntax });
  }
  return [{ state, completion: 'normal', value: UNDEFINED }];
}

const EXECUTORS = {
  bind: execBind,
  set: execSet,
  eval: (stmt, state, ctx) => normal(evalExpr(stmt.value, state, ctx)),
  if: execIf,
  return: execCompletion,
  throw: execCompletion,
  try: execTry,
  unsupported: execUnsupported,
};

function execBlock(stmts, state, ctx) {
  let open = [{ state, completion: 'normal', value: UNDEFINED }];
  const done = [];
  for (const stmt of stmts) {
    const next = open.flatMap((result) => EXECUTORS[stmt.kind](stmt, result.state, ctx));
    done.push(...next.filter((result) => result.completion !== 'normal'));
    open = next.filter((result) => result.completion === 'normal');
  }
  return [...done, ...open];
}

function leaveFrame(result, frame) {
  result.state.frame = frame.saved;
  result.state.stack = frame.stack;
  if (result.completion === 'throw') {
    return { state: result.state, thrown: result.value };
  }
  return { state: result.state, value: result.completion === 'return' ? result.value : UNDEFINED };
}

function enterChecks(state, { fn, loc }) {
  if (state.stack.includes(fn.name)) {
    addPartial(state, { reason: 'recursion', loc, detail: fn.name });
  }
  for (const param of fn.params.filter((item) => item.supported === false)) {
    addPartial(state, {
      reason: 'unsupported-syntax',
      loc: fn.loc,
      detail: `parameter ${param.name}`,
    });
  }
}

export function callHelper(state, { name, args, expr }) {
  const ctx = state.run;
  const fn = ctx.model.functions[name];
  const { loc } = expr;
  if (state.stack.length >= ctx.bounds.maxDepth || fn.async || fn.generator) {
    const reason = fn.async || fn.generator ? 'async' : 'call-depth';
    opaqueEffects(state, { loc, detail: `${reason} ${name}` });
    return unknownCall(state, { reason, loc, detail: name, args });
  }
  enterChecks(state, { fn, loc });
  const frame = { saved: state.frame, stack: [...state.stack] };
  state.frame = { fn: name, args, sites: [...(frame.saved.sites ?? []), expr.site] };
  state.stack = [...state.stack, name];
  return runBody(state, fn).map((result) => leaveFrame(result, frame));
}

function setArgument(state, index, value) {
  const args = [...state.frame.args];
  args[index] = value;
  state.frame = { ...state.frame, args };
}

function freshParameter(state, param) {
  const key = `parameter:${state.frame.fn}:${param.name}#${String(nextCall(state))}`;
  setArgument(state, param.index, { t: 'atom', key });
}

function maybeUndefined(value) {
  if (value.t !== 'atom') {
    return value.t === 'undef';
  }
  return !Array.isArray(value.domain) || value.domain.includes(undefined);
}

function bindParameter(state, { param, fn }) {
  const value = resolve(state, state.frame.args[param.index] ?? UNDEFINED);
  if (param.supported === false) {
    freshParameter(state, param);
    return [{ state, value }];
  }
  if (param.default === undefined || !maybeUndefined(value)) {
    return [{ state, value }];
  }
  if (value.t === 'atom') {
    addPartial(state, { reason: 'unknown-guard', loc: fn.loc, detail: `default of ${param.name}` });
    freshParameter(state, param);
    return [{ state, value }];
  }
  return chain(evalExpr(param.default, state, state.run), (next, initial) => {
    setArgument(next, param.index, initial);
    return [{ state: next, value: initial }];
  });
}

export function runBody(state, fn) {
  let results = [{ state, value: UNDEFINED }];
  for (const param of fn.params) {
    results = chain(results, (current) => bindParameter(current, { param, fn }));
  }
  return results.flatMap((result) =>
    'thrown' in result
      ? [{ state: result.state, completion: 'throw', value: result.thrown }]
      : execBlock(fn.body, result.state, state.run),
  );
}
