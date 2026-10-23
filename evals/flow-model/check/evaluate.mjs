import { render } from '../extract/render.mjs';
import { effectCall, pureCall, unknownCall } from './effects.mjs';
import { compare, truth } from './guards.mjs';
import { UNDEFINED, addPartial, alternatives, mutate, nextCall, stepOf } from './state.mjs';
import { getField, resolve } from './values.mjs';

export function chain(results, next) {
  return results.flatMap((result) =>
    'thrown' in result ? [result] : next(result.state, result.value),
  );
}

function evalList(exprs, state, ctx) {
  let results = [{ state, value: [] }];
  for (const expr of exprs) {
    results = chain(results, (current, values) =>
      chain(evalExpr(expr, current, ctx), (next, value) => [
        { state: next, value: [...values, value] },
      ]),
    );
  }
  return results;
}

const SELF_RECORDING = new Set(['cmp', 'not', 'and', 'or']);

function recorded(pairs, expr, fallbackLoc) {
  const loc = expr.loc ?? fallbackLoc ?? { line: 0, column: 0 };
  const text = render(expr);
  for (const [state, outcome] of pairs) {
    const { line, column } = loc;
    state.guards.push({ text, value: outcome, line, column, seq: stepOf(state) });
  }
  return pairs;
}

function decided(pairs, expr, fallbackLoc) {
  return SELF_RECORDING.has(expr.kind) ? pairs : recorded(pairs, expr, fallbackLoc);
}

export function testValue(expr, state, loc) {
  return chain(evalExpr(expr, state, state.run), (current, value) =>
    decided(truth(current, value, expr.loc ?? loc), expr, loc).map(([next, outcome]) => ({
      state: next,
      value: outcome,
    })),
  );
}

function calleeName(callee, receiver) {
  if (callee.kind === 'import') {
    return `${callee.module}#${callee.name}`;
  }
  if (callee.kind === 'global') {
    return callee.name;
  }
  if (callee.kind !== 'member') {
    return undefined;
  }
  const base = { input: receiver.path, atom: receiver.key?.replace(/^global:/, '') }[receiver.t];
  return base === undefined ? undefined : `${base}.${callee.method}`;
}

function contractFor(ctx, name) {
  return name !== undefined && Object.hasOwn(ctx.contracts.effects, name)
    ? ctx.contracts.effects[name]
    : undefined;
}

function dispatch(expr, state, { receiver, args }) {
  const ctx = state.run;
  const { callee, loc } = expr;
  if (callee.kind === 'helper' && Object.hasOwn(ctx.model.functions, callee.name)) {
    return ctx.callHelper(state, { name: callee.name, args, expr });
  }
  const name = calleeName(callee, receiver);
  const contract = contractFor(ctx, name);
  if (contract !== undefined) {
    return effectCall(state, { name, contract, args, expr });
  }
  if (name !== undefined && ctx.contracts.pure.includes(name)) {
    return pureCall(state, { name, args });
  }
  const reason =
    name === undefined && callee.kind !== 'helper' ? 'unknown-dispatch' : 'unknown-call';
  return unknownCall(state, { reason, loc, detail: name ?? render(expr) });
}

function evalCall(expr, state, ctx) {
  const receiverResults =
    expr.callee.kind === 'member'
      ? evalExpr(expr.callee.receiver, state, ctx)
      : [{ state, value: UNDEFINED }];
  return chain(receiverResults, (current, receiver) =>
    chain(evalList(expr.args, current, ctx), (next, args) =>
      dispatch(expr, next, { receiver, args }),
    ),
  );
}

function evalNew(expr, state, ctx) {
  return chain(evalList(expr.args, state, ctx), (next, args) =>
    ctx.contracts.constructs.includes(expr.name)
      ? pureCall(next, { name: expr.name, args, constructs: true })
      : unknownCall(next, { reason: 'unknown-call', loc: expr.loc, detail: `new ${expr.name}` }),
  );
}

function evalCompare(expr, state, ctx) {
  return chain(evalList([expr.left, expr.right], state, ctx), (current, [left, right]) => {
    const pairs = compare(current, { left, right, op: expr.op, loc: expr.loc });
    return recorded(pairs, expr).map(([next, value]) => ({
      state: next,
      value: { t: 'lit', v: value },
    }));
  });
}

function evalLogic(expr, state, ctx) {
  return chain(evalExpr(expr.left, state, ctx), (current, left) =>
    decided(truth(current, left, expr.loc), expr.left, expr.loc).flatMap(([next, outcome]) =>
      outcome === (expr.kind === 'and')
        ? evalExpr(expr.right, next, ctx)
        : [{ state: next, value: left }],
    ),
  );
}

function evalConditional(expr, state, ctx) {
  return chain(testValue(expr.test, state, expr.loc), (next, outcome) =>
    evalExpr(outcome ? expr.then : expr.else, next, ctx),
  );
}

function evalUnsupported(expr, state) {
  const { loc, syntax } = expr;
  if (expr.mutates) {
    mutate(state, { clobbers: expr.clobbers, loc, syntax });
  } else {
    addPartial(state, { reason: 'unsupported-syntax', loc, detail: syntax });
  }
  if (expr.hasCall) {
    return unknownCall(state, { reason: 'unsupported-syntax', loc, detail: syntax });
  }
  const key = `unknown@${String(loc.line)}:${String(loc.column)}#${String(nextCall(state))}`;
  return [{ state, value: { t: 'atom', key } }];
}

function evalObject(expr, state, ctx) {
  const values = expr.fields.map(([, value]) => value);
  return chain(evalList(values, state, ctx), (next, items) => {
    const fields = expr.fields.map(([key], index) => [key, items[index]]);
    const id = `object#${String(nextCall(next))}`;
    return [{ state: next, value: { t: 'obj', id, epoch: next.epoch, fields } }];
  });
}

function evalTemplate(expr, state, ctx) {
  const exprs = expr.parts.filter((part) => typeof part !== 'string');
  return chain(evalList(exprs, state, ctx), (next, values) => {
    const queue = [...values];
    const parts = expr.parts.map((part) => (typeof part === 'string' ? part : queue.shift()));
    return [{ state: next, value: { t: 'tmpl', parts } }];
  });
}

function importValue(expr) {
  const label = `import:${expr.module}#${expr.name}`;
  return expr.name === '*' ? { t: 'opaque', label } : { t: 'atom', key: label };
}

function moduleValue(expr) {
  const label = `module:${expr.name}`;
  return expr.object ? { t: 'opaque', label } : { t: 'atom', key: label };
}

function typeError(state) {
  return { state, thrown: { t: 'atom', key: `error:TypeError#${String(nextCall(state))}` } };
}

function fieldRead(state, object, expr) {
  const resolved = resolve(state, object);
  if (resolved.t === 'undef') {
    return [typeError(state)];
  }
  if (resolved.t !== 'atom') {
    return [{ state, value: getField(state, resolved, expr.field) }];
  }
  return alternatives(state, ['read', 'throw']).map(([next, outcome]) => {
    const detail = `property ${expr.field} of an unconstrained value`;
    addPartial(next, { reason: 'unknown-guard', loc: expr.loc, detail });
    return outcome === 'read'
      ? { state: next, value: getField(next, resolved, expr.field) }
      : typeError(next);
  });
}

function constant(value) {
  return function evaluateConstant(expr, state) {
    return [{ state, value: value(expr, state) }];
  };
}

const EVALUATORS = {
  lit: constant((expr) => ({ t: 'lit', v: expr.value })),
  undefined: constant(() => UNDEFINED),
  param: constant((expr, state) => state.frame.args[expr.index] ?? UNDEFINED),
  local: constant((expr, state) => state.env.get(expr.id) ?? UNDEFINED),
  global: constant((expr) => ({ t: 'atom', key: `global:${expr.name}` })),
  import: constant(importValue),
  helper: constant((expr) => ({ t: 'opaque', label: `function:${expr.name}` })),
  module: constant(moduleValue),
  get: (expr, state, ctx) =>
    chain(evalExpr(expr.object, state, ctx), (next, object) => fieldRead(next, object, expr)),
  call: evalCall,
  new: evalNew,
  cmp: evalCompare,
  not: (expr, state) =>
    chain(testValue(expr.operand, state, expr.loc), (next, outcome) => [
      { state: next, value: { t: 'lit', v: !outcome } },
    ]),
  and: evalLogic,
  or: evalLogic,
  cond: evalConditional,
  object: evalObject,
  template: evalTemplate,
  unsupported: evalUnsupported,
};

export function evalExpr(expr, state, ctx) {
  return EVALUATORS[expr.kind](expr, state, ctx);
}
