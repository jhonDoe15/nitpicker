import { dispatch } from '../dispatch/dispatch.mts';
import { render } from '../extract/render.mts';
import type { Flow, RunContext, State, Value } from '../model/run-types.mts';
import type {
  CallExpr,
  CompareExpr,
  ConditionalExpr,
  Expr,
  GetExpr,
  Loc,
  LogicExpr,
  NewExpr,
  ObjectExpr,
  TemplateExpr,
  Unsupported,
} from '../model/syntax-types.mts';
import { opaqueEffects, pureCall, unknownCall } from './effects.mts';
import { compare, truth } from './guards.mts';
import { UNDEFINED, addPartial, alternatives, mutate, nextCall, stepOf } from './state.mts';
import { getField, resolve } from './values.mts';

type Pairs = [State, boolean][];
type ConstantExpr = Extract<
  Expr,
  { kind: 'lit' | 'undefined' | 'param' | 'local' | 'global' | 'import' | 'helper' | 'module' }
>;

const SELF_RECORDING = new Set(['cmp', 'not', 'and', 'or']);

export function chain<A, B>(
  results: readonly Flow<A>[],
  next: (state: State, value: A) => Flow<B>[],
): Flow<B>[] {
  return results.flatMap((result) =>
    'thrown' in result ? [result] : next(result.state, result.value),
  );
}

function evalList(exprs: readonly Expr[], state: State, ctx: RunContext): Flow<Value[]>[] {
  let results: Flow<Value[]>[] = [{ state, value: [] }];
  for (const expr of exprs) {
    results = chain(results, (current, values) =>
      chain(evalExpr(expr, current, ctx), (next, value) => [
        { state: next, value: [...values, value] },
      ]),
    );
  }
  return results;
}

function locOf(expr: Expr): Loc | undefined {
  return 'loc' in expr ? expr.loc : undefined;
}

function recorded(pairs: Pairs, expr: Expr, fallbackLoc?: Loc): Pairs {
  const loc = locOf(expr) ?? fallbackLoc ?? { line: 0, column: 0 };
  const text = render(expr);
  for (const [state, outcome] of pairs) {
    const { line, column } = loc;
    state.guards.push({ text, value: outcome, line, column, seq: stepOf(state) });
  }
  return pairs;
}

function decided(pairs: Pairs, expr: Expr, fallbackLoc?: Loc): Pairs {
  return SELF_RECORDING.has(expr.kind) ? pairs : recorded(pairs, expr, fallbackLoc);
}

export function testValue(expr: Expr, state: State, loc: Loc | undefined): Flow<boolean>[] {
  return chain(evalExpr(expr, state, state.run), (current, value) =>
    decided(truth(current, value, locOf(expr) ?? loc), expr, loc).map(
      ([next, outcome]): Flow<boolean> => ({ state: next, value: outcome }),
    ),
  );
}

function evalCall(expr: CallExpr, state: State, ctx: RunContext): Flow[] {
  const receiverResults: Flow[] =
    expr.callee.kind === 'member'
      ? evalExpr(expr.callee.receiver, state, ctx)
      : [{ state, value: UNDEFINED }];
  return chain(receiverResults, (current, receiver) =>
    chain(evalList(expr.args, current, ctx), (next, args) =>
      dispatch(expr, next, { receiver, args }),
    ),
  );
}

function evalNew(expr: NewExpr, state: State, ctx: RunContext): Flow[] {
  return chain(evalList(expr.args, state, ctx), (next, args) =>
    expr.global && ctx.contracts.constructs.includes(expr.name)
      ? pureCall(next, { name: expr.name, args, constructs: true })
      : unknownCall(next, {
          reason: 'unknown-call',
          loc: expr.loc,
          detail: `new ${expr.name}`,
          args,
        }),
  );
}

function evalCompare(expr: CompareExpr, state: State, ctx: RunContext): Flow[] {
  return chain(evalExpr(expr.left, state, ctx), (afterLeft, left) =>
    chain(evalExpr(expr.right, afterLeft, ctx), (current, right) => {
      const pairs = compare(current, { left, right, op: expr.op, loc: expr.loc });
      return recorded(pairs, expr).map(([next, value]): Flow => ({
        state: next,
        value: { t: 'lit', v: value },
      }));
    }),
  );
}

function evalLogic(expr: LogicExpr, state: State, ctx: RunContext): Flow[] {
  return chain(evalExpr(expr.left, state, ctx), (current, left) =>
    decided(truth(current, left, expr.loc), expr.left, expr.loc).flatMap(
      ([next, outcome]): Flow[] =>
        outcome === (expr.kind === 'and')
          ? evalExpr(expr.right, next, ctx)
          : [{ state: next, value: left }],
    ),
  );
}

function evalConditional(expr: ConditionalExpr, state: State, ctx: RunContext): Flow[] {
  return chain(testValue(expr.test, state, expr.loc), (next, outcome) =>
    evalExpr(outcome ? expr.then : expr.else, next, ctx),
  );
}

function evalUnsupported(expr: Unsupported, state: State): Flow[] {
  const { loc, syntax } = expr;
  if (expr.mutates) {
    mutate(state, { region: expr, loc, syntax });
  } else {
    addPartial(state, { reason: 'unsupported-syntax', loc, detail: syntax });
  }
  if (expr.hasCall) {
    opaqueEffects(state, { loc, detail: syntax });
    return unknownCall(state, { reason: 'unsupported-syntax', loc, detail: syntax });
  }
  const key = `unknown@${String(loc.line)}:${String(loc.column)}#${String(nextCall(state))}`;
  return [{ state, value: { t: 'atom', key } }];
}

function valueAt(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`flow-model: evaluation produced no value for operand ${String(index)}`);
  }
  return value;
}

function evalObject(expr: ObjectExpr, state: State, ctx: RunContext): Flow[] {
  const values = expr.fields.map(([, value]) => value);
  return chain(evalList(values, state, ctx), (next, items) => {
    const fields = expr.fields.map(([key], index): readonly [string, Value] => [
      key,
      valueAt(items, index),
    ]);
    const id = `object#${String(nextCall(next))}`;
    return [{ state: next, value: { t: 'obj', id, epoch: next.epoch, fields } }];
  });
}

function evalTemplate(expr: TemplateExpr, state: State, ctx: RunContext): Flow[] {
  const exprs = expr.parts.filter((part) => typeof part !== 'string');
  return chain(evalList(exprs, state, ctx), (next, values) => {
    let used = 0;
    const parts = expr.parts.map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      used += 1;
      return valueAt(values, used - 1);
    });
    return [{ state: next, value: { t: 'tmpl', parts } }];
  });
}

function typeError(state: State): Flow {
  return { state, thrown: { t: 'atom', key: `error:TypeError#${String(nextCall(state))}` } };
}

function fieldRead(state: State, object: Value, expr: GetExpr): Flow[] {
  const resolved = resolve(state, object);
  if (resolved.t === 'undef') {
    return [typeError(state)];
  }
  if (resolved.t !== 'atom') {
    return [{ state, value: getField(state, resolved, expr.field) }];
  }
  return alternatives(state, ['read', 'throw']).map(([next, outcome]): Flow => {
    const detail = `property ${String(expr.field)} of an unconstrained value`;
    addPartial(next, { reason: 'unknown-guard', loc: expr.loc, detail });
    return outcome === 'read'
      ? { state: next, value: getField(next, resolved, expr.field) }
      : typeError(next);
  });
}

function constantValue(expr: ConstantExpr, state: State): Value {
  switch (expr.kind) {
    case 'lit':
      return { t: 'lit', v: expr.value };
    case 'undefined':
      return UNDEFINED;
    case 'param':
      return state.frame.args[expr.index] ?? UNDEFINED;
    case 'local':
      return state.env.get(expr.id) ?? UNDEFINED;
    case 'global':
      return { t: 'atom', key: `global:${expr.name}` };
    case 'import': {
      const label = `import:${expr.module}#${expr.name}`;
      return expr.name === '*' ? { t: 'opaque', label } : { t: 'atom', key: label };
    }
    case 'helper':
      return { t: 'opaque', label: `function:${expr.name}` };
    case 'module': {
      const label = `module:${expr.name}`;
      return expr.object ? { t: 'opaque', label } : { t: 'atom', key: label };
    }
  }
}

export function evalExpr(expr: Expr, state: State, ctx: RunContext): Flow[] {
  switch (expr.kind) {
    case 'lit':
    case 'undefined':
    case 'param':
    case 'local':
    case 'global':
    case 'import':
    case 'helper':
    case 'module':
      return [{ state, value: constantValue(expr, state) }];
    case 'get':
      return chain(evalExpr(expr.object, state, ctx), (next, object) =>
        fieldRead(next, object, expr),
      );
    case 'call':
      return evalCall(expr, state, ctx);
    case 'new':
      return evalNew(expr, state, ctx);
    case 'cmp':
      return evalCompare(expr, state, ctx);
    case 'not':
      return chain(testValue(expr.operand, state, expr.loc), (next, outcome): Flow[] => [
        { state: next, value: { t: 'lit', v: !outcome } },
      ]);
    case 'and':
    case 'or':
      return evalLogic(expr, state, ctx);
    case 'cond':
      return evalConditional(expr, state, ctx);
    case 'object':
      return evalObject(expr, state, ctx);
    case 'template':
      return evalTemplate(expr, state, ctx);
    case 'unsupported':
      return evalUnsupported(expr, state);
  }
}
