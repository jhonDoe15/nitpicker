import { effectCall, opaqueEffects, pureCall, unknownCall } from '../check/effects.mts';
import { render } from '../extract/render.mts';
import type { EffectContract } from '../model/contract-types.mts';
import type { Flow, RunContext, State, Value } from '../model/run-types.mts';
import type { CallExpr, Callee } from '../model/syntax-types.mts';

function calleeName(callee: Callee, receiver: Value): string | undefined {
  if (callee.kind === 'import') {
    return `${callee.module}#${callee.name}`;
  }
  if (callee.kind === 'global') {
    return callee.name;
  }
  if (callee.kind !== 'member') {
    return undefined;
  }
  if (receiver.t === 'input') {
    return `${receiver.path}.${callee.method}`;
  }
  return receiver.t === 'atom' ? `${receiver.key}.${callee.method}` : undefined;
}

function contractFor(
  ctx: RunContext,
  { name, callee, receiver }: { name: string | undefined; callee: Callee; receiver: Value },
): EffectContract | undefined {
  const bound = callee.kind === 'import' || (receiver.t === 'input' && receiver.effects === true);
  if (!bound || name === undefined || !Object.hasOwn(ctx.contracts.effects, name)) {
    return undefined;
  }
  return ctx.contracts.effects[name];
}

export function dispatch(
  expr: CallExpr,
  state: State,
  { receiver, args }: { receiver: Value; args: readonly Value[] },
): Flow[] {
  const ctx = state.run;
  const { callee } = expr;
  if (callee.kind === 'helper' && Object.hasOwn(ctx.model.functions, callee.name)) {
    return ctx.callHelper(state, { name: callee.name, args, expr });
  }
  const name = calleeName(callee, receiver);
  const contract = contractFor(ctx, { name, callee, receiver });
  if (contract !== undefined && name !== undefined) {
    return effectCall(state, { name, contract, args, expr });
  }
  if (callee.kind === 'global' && ctx.contracts.pure.includes(callee.name)) {
    return pureCall(state, { name: callee.name, args });
  }
  return unresolvedCall(state, { expr, name, args: [receiver, ...args] });
}

function unresolvedCall(
  state: State,
  { expr, name, args }: { expr: CallExpr; name: string | undefined; args: readonly Value[] },
): Flow[] {
  const { callee, loc } = expr;
  const dynamic = name === undefined && callee.kind !== 'helper';
  if (dynamic) {
    opaqueEffects(state, { loc, detail: 'dynamic call' });
  }
  const reason = dynamic ? 'unknown-dispatch' : 'unknown-call';
  return unknownCall(state, { reason, loc, detail: name ?? render(expr), args });
}
