import { render } from '../extract/render.mjs';
import { effectCall, pureCall, unknownCall } from './effects.mjs';
import { UNDEFINED, addPartial, stepOf } from './state.mjs';
import { compare, getField, truth } from './values.mjs';

export function chain(results, next) {
  return results.flatMap((result) =>
    'thrown' in result ? [result] : next(result.state, result.value),
  );
}

export function evalList(exprs, state, ctx) {
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
    state.guards.push({
      text,
      value: outcome,
      line: loc.line,
      column: loc.column,
      seq: stepOf(state),
    });
  }
  return pairs;
}

function decided(pairs, expr, fallbackLoc) {
  return SELF_RECORDING.has(expr.kind) ? pairs : recorded(pairs, expr, fallbackLoc);
}

export function testValue(expr, state, loc) {
  return chain(evalExpr(expr, state, state.run), (current, value) =>
    decided(truth(current, value), expr, loc).map(([next, outcome]) => ({
      state: next,
      value: outcome,
    })),
  );
}

function boolean(results) {
  return results.map((result) =>
    'thrown' in result ? result : { state: result.state, value: { t: 'lit', v: result.value } },
  );
}

function calleeName(callee, receiver) {
  if (callee.kind === 'import' || callee.kind === 'global') {
    return callee.name;
  }
  if (callee.kind !== 'member') {
    return undefined;
  }
  const base = { input: receiver.path, atom: receiver.key?.replace(/^global:/, '') }[receiver.t];
  return base === undefined ? undefined : `${base}.${callee.method}`;
}

function dispatch(expr, state, { receiver, args }) {
  const ctx = state.run;
  const { callee, loc } = expr;
  if (callee.kind === 'helper' && ctx.model.functions[callee.name] !== undefined) {
    return ctx.callHelper(state, { name: callee.name, args, loc });
  }
  const name = calleeName(callee, receiver);
  const contract = name === undefined ? undefined : ctx.contracts.effects[name];
  if (contract !== undefined) {
    return effectCall(state, { name, contract, args, loc });
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
      : [{ state, value: undefined }];
  return chain(receiverResults, (current, receiver) =>
    chain(evalList(expr.args, current, ctx), (next, args) =>
      dispatch(expr, next, { receiver, args }),
    ),
  );
}

function evalNew(expr, state, ctx) {
  return chain(evalList(expr.args, state, ctx), (next, args) =>
    ctx.contracts.pure.includes(expr.name)
      ? pureCall(next, { name: expr.name, args, constructs: true })
      : unknownCall(next, {
          reason: 'unknown-call',
          loc: expr.loc,
          detail: `new ${expr.name}`,
        }),
  );
}

function evalCompare(expr, state, ctx) {
  return chain(evalList([expr.left, expr.right], state, ctx), (current, [left, right]) =>
    boolean(
      recorded(compare(current, { left, right, op: expr.op }), expr).map(([next, value]) => ({
        state: next,
        value,
      })),
    ),
  );
}

function evalLogic(expr, state, ctx) {
  return chain(evalExpr(expr.left, state, ctx), (current, left) =>
    decided(truth(current, left), expr.left, expr.loc).flatMap(([next, outcome]) =>
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
  if (expr.hasCall) {
    return unknownCall(state, {
      reason: 'unsupported-syntax',
      loc: expr.loc,
      detail: expr.syntax,
    });
  }
  if (expr.syntax === 'outer-binding' || expr.syntax === 'spread') {
    addPartial(state, { reason: 'unsupported-syntax', loc: expr.loc, detail: expr.syntax });
  }
  return [
    {
      state,
      value: { t: 'atom', key: `unknown@${String(expr.loc.line)}:${String(expr.loc.column)}` },
    },
  ];
}

const EVALUATORS = {
  lit: (expr, state) => [{ state, value: { t: 'lit', v: expr.value } }],
  undefined: (_expr, state) => [{ state, value: UNDEFINED }],
  param: (expr, state) => [{ state, value: state.frame.args[expr.index] ?? UNDEFINED }],
  local: (expr, state) => [{ state, value: state.env.get(expr.id) ?? UNDEFINED }],
  global: (expr, state) => [{ state, value: { t: 'atom', key: `global:${expr.name}` } }],
  import: (expr, state) => [{ state, value: { t: 'opaque', label: `import:${expr.name}` } }],
  helper: (expr, state) => [{ state, value: { t: 'opaque', label: `function:${expr.name}` } }],
  module: (expr, state) => [{ state, value: { t: 'opaque', label: `module:${expr.name}` } }],
  get: (expr, state, ctx) =>
    chain(evalExpr(expr.object, state, ctx), (next, object) => [
      { state: next, value: getField(next, object, expr.field) },
    ]),
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
  object: (expr, state, ctx) =>
    chain(
      evalList(
        expr.fields.map(([, value]) => value),
        state,
        ctx,
      ),
      (next, values) => [
        {
          state: next,
          value: { t: 'obj', fields: expr.fields.map(([key], index) => [key, values[index]]) },
        },
      ],
    ),
  template: (expr, state, ctx) => {
    const exprs = expr.parts.filter((part) => typeof part !== 'string');
    return chain(evalList(exprs, state, ctx), (next, values) => {
      const queue = [...values];
      const parts = expr.parts.map((part) => (typeof part === 'string' ? part : queue.shift()));
      return [{ state: next, value: { t: 'tmpl', parts } }];
    });
  },
  unsupported: evalUnsupported,
};

export function evalExpr(expr, state, ctx) {
  return EVALUATORS[expr.kind](expr, state, ctx);
}
