import { functionNamed } from '../model/functions.mts';
import type {
  Completion,
  Flow,
  Frame,
  HelperCall,
  RunContext,
  State,
  Value,
} from '../model/run-types.mts';
import type {
  BindStmt,
  CompletionStmt,
  FunctionModel,
  IfStmt,
  Loc,
  ParamModel,
  SetStmt,
  Stmt,
  TryStmt,
  Unsupported,
} from '../model/syntax-types.mts';
import { opaqueEffects, unknownCall } from './effects.mts';
import { chain, evalExpr, testValue } from './evaluate.mts';
import { UNDEFINED, addPartial, mutate, nextCall, stepOf } from './state.mts';
import { getField, resolve } from './values.mts';

type SavedFrame = { readonly saved: Frame; readonly stack: string[] };

function normal(results: readonly Flow<unknown>[]): Completion[] {
  return results.map((result): Completion =>
    'thrown' in result
      ? { state: result.state, completion: 'throw', value: result.thrown }
      : { state: result.state, completion: 'normal', value: UNDEFINED },
  );
}

function execBind(stmt: BindStmt, state: State, ctx: RunContext): Completion[] {
  return normal(
    chain(evalExpr(stmt.value, state, ctx), (next, value): Flow[] => {
      next.env.set(stmt.id, value);
      return [{ state: next, value }];
    }),
  );
}

function baseOf(object: Value): string | undefined {
  if (object.t === 'input') {
    return object.path;
  }
  return object.t === 'obj' ? object.id : undefined;
}

function execSet(stmt: SetStmt, state: State, ctx: RunContext): Completion[] {
  return normal(
    chain(evalExpr(stmt.object, state, ctx), (current, object) =>
      chain(evalExpr(stmt.value, current, ctx), (next, value): Flow[] => {
        const base = baseOf(object);
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

function execIf(stmt: IfStmt, state: State, ctx: RunContext): Completion[] {
  const tested = testValue(stmt.test, state, stmt.testLoc);
  return tested.flatMap((result) =>
    'thrown' in result
      ? normal([result])
      : execBlock(result.value ? stmt.then : stmt.else, result.state, ctx),
  );
}

function execCompletion(stmt: CompletionStmt, state: State, ctx: RunContext): Completion[] {
  return evalExpr(stmt.value, state, ctx).map((result): Completion =>
    'thrown' in result
      ? { state: result.state, completion: 'throw', value: result.thrown }
      : { state: result.state, completion: stmt.kind, value: result.value },
  );
}

function execTry(stmt: TryStmt, state: State, ctx: RunContext): Completion[] {
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

function execUnsupported(stmt: Unsupported, state: State): Completion[] {
  const reason = stmt.syntax === 'loop' ? 'loop' : 'unsupported-syntax';
  mutate(state, { reason, region: stmt, loc: stmt.loc, syntax: stmt.syntax });
  if (stmt.hasCall) {
    opaqueEffects(state, { loc: stmt.loc, detail: stmt.syntax });
  }
  return [{ state, completion: 'normal', value: UNDEFINED }];
}

function execStmt(stmt: Stmt, state: State, ctx: RunContext): Completion[] {
  switch (stmt.kind) {
    case 'bind':
      return execBind(stmt, state, ctx);
    case 'set':
      return execSet(stmt, state, ctx);
    case 'eval':
      return normal(evalExpr(stmt.value, state, ctx));
    case 'if':
      return execIf(stmt, state, ctx);
    case 'return':
    case 'throw':
      return execCompletion(stmt, state, ctx);
    case 'try':
      return execTry(stmt, state, ctx);
    case 'unsupported':
      return execUnsupported(stmt, state);
  }
}

function execBlock(stmts: readonly Stmt[], state: State, ctx: RunContext): Completion[] {
  let open: Completion[] = [{ state, completion: 'normal', value: UNDEFINED }];
  const done: Completion[] = [];
  for (const stmt of stmts) {
    const next = open.flatMap((result) => execStmt(stmt, result.state, ctx));
    done.push(...next.filter((result) => result.completion !== 'normal'));
    open = next.filter((result) => result.completion === 'normal');
  }
  return [...done, ...open];
}

function leaveFrame(result: Completion, frame: SavedFrame): Flow {
  result.state.frame = frame.saved;
  result.state.stack = frame.stack;
  if (result.completion === 'throw') {
    return { state: result.state, thrown: result.value };
  }
  return { state: result.state, value: result.completion === 'return' ? result.value : UNDEFINED };
}

function enterChecks(state: State, { fn, loc }: { fn: FunctionModel; loc: Loc }): void {
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

export function callHelper(state: State, { name, args, expr }: HelperCall): Flow[] {
  const ctx = state.run;
  const fn = functionNamed(ctx.model, name);
  const { loc } = expr;
  if (state.stack.length >= ctx.bounds.maxDepth || fn.async === true || fn.generator === true) {
    const reason = fn.async === true || fn.generator === true ? 'async' : 'call-depth';
    opaqueEffects(state, { loc, detail: `${reason} ${name}` });
    return unknownCall(state, { reason, loc, detail: name, args });
  }
  enterChecks(state, { fn, loc });
  const frame: SavedFrame = { saved: state.frame, stack: [...state.stack] };
  state.frame = { fn: name, args, sites: [...(frame.saved.sites ?? []), expr.site] };
  state.stack = [...state.stack, name];
  return runBody(state, fn).map((result) => leaveFrame(result, frame));
}

function setArgument(state: State, index: number, value: Value): void {
  const args = [...state.frame.args];
  args[index] = value;
  state.frame = { ...state.frame, args };
}

function freshParameter(state: State, param: ParamModel): void {
  const key = `parameter:${state.frame.fn}:${param.name}#${String(nextCall(state))}`;
  setArgument(state, param.index, { t: 'atom', key });
}

function maybeUndefined(value: Value): boolean {
  if (value.t !== 'atom') {
    return value.t === 'undef';
  }
  return value.domain === undefined || value.domain.includes(undefined);
}

function bindParameter(
  state: State,
  { param, fn }: { param: ParamModel; fn: FunctionModel },
): Flow[] {
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
  return chain(evalExpr(param.default, state, state.run), (next, initial): Flow[] => {
    setArgument(next, param.index, initial);
    return [{ state: next, value: initial }];
  });
}

export function runBody(state: State, fn: FunctionModel): Completion[] {
  let results: Flow[] = [{ state, value: UNDEFINED }];
  for (const param of fn.params) {
    results = chain(results, (current) => bindParameter(current, { param, fn }));
  }
  return results.flatMap((result) =>
    'thrown' in result
      ? [{ state: result.state, completion: 'throw' as const, value: result.thrown }]
      : execBlock(fn.body, result.state, state.run),
  );
}
