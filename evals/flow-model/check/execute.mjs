import { unknownCall } from './effects.mjs';
import { chain, evalExpr, testValue } from './evaluate.mjs';
import { UNDEFINED, addPartial, stepOf, widen } from './state.mjs';

const UNSUPPORTED_REASONS = { loop: 'loop', finally: 'unsupported-syntax' };

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
        if (object.t === 'input') {
          next.fields.set(`${object.path}.${stmt.field}`, value);
        } else {
          addPartial(next, { reason: 'unsupported-syntax', loc: stmt.loc, detail: 'mutation' });
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
    if (stmt.catchId !== null) {
      result.state.env.set(stmt.catchId, result.value);
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
  const reason = UNSUPPORTED_REASONS[stmt.syntax] ?? 'unsupported-syntax';
  addPartial(state, { reason, loc: stmt.loc, detail: stmt.syntax });
  widen(state);
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

export function execBlock(stmts, state, ctx) {
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

export function callHelper(state, { name, args, loc }) {
  const ctx = state.run;
  if (state.stack.includes(name) || state.stack.length >= ctx.bounds.maxDepth) {
    const reason = state.stack.includes(name) ? 'recursion' : 'call-depth';
    return unknownCall(state, { reason, loc, detail: name });
  }
  const fn = ctx.model.functions[name];
  const frame = { saved: state.frame, stack: [...state.stack] };
  for (const param of fn.params.filter((item) => item.supported === false)) {
    addPartial(state, {
      reason: 'unsupported-syntax',
      loc: fn.loc,
      detail: `parameter ${param.name}`,
    });
  }
  state.frame = { fn: name, args };
  state.stack = [...state.stack, name];
  return execBlock(fn.body, state, ctx).map((result) => leaveFrame(result, frame));
}
