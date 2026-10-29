import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, resolveFunction } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { clientSpec } from './client-modules.mjs';
import { createOrigins, skipped } from './io-origin.mjs';

const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

function isGlobalFetch(context, callee) {
  const target = unwrapped(callee);
  if (target.type === 'MemberExpression') {
    const owner = unwrapped(target.object);
    return (
      owner.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(owner.name) &&
      memberName(target) === 'fetch'
    );
  }
  const isFetch = target.type === 'Identifier' && target.name === 'fetch';
  return isFetch && (findVariable(context, target, 'fetch')?.defs.length ?? 0) === 0;
}

function memberKind(base, name) {
  if (base === undefined || name === undefined) {
    return undefined;
  }
  const { spec } = base;
  if (base.instance) {
    return spec.methods === '*' || spec.methods.has(name) ? spec.kind : undefined;
  }
  const callsModule =
    base.member === undefined &&
    (spec.methods.has(name) ||
      spec.functions.has(name) ||
      (name === 'default' && spec.callable === true));
  return callsModule ? spec.kind : undefined;
}

function identifierKind(ref) {
  if (ref === undefined || ref.instance) {
    return undefined;
  }
  const { spec } = ref;
  const named = spec.functions.has(ref.imported);
  return named || (ref.imported === 'default' && spec.callable === true) ? spec.kind : undefined;
}

function ioKind(call, { context, originOf }) {
  const callee = skipped(call.callee);
  if (callee.type === 'ArrowFunctionExpression' || callee.type === 'FunctionExpression') {
    return undefined;
  }
  if (isGlobalFetch(context, callee)) {
    return 'remote';
  }
  if (callee.type === 'Identifier') {
    return identifierKind(originOf(callee));
  }
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  return memberKind(originOf(callee.object), memberName(callee));
}

function methodOf(context, callee) {
  const member = skipped(callee);
  const isThisCall = member.type === 'MemberExpression' && member.object.type === 'ThisExpression';
  if (!isThisCall) {
    return undefined;
  }
  const current = ancestorsOf(member).find((node) => node.type === 'ClassBody');
  const found = current?.body.find(
    (entry) => entry.type === 'MethodDefinition' && entry.key.name === memberName(member),
  );
  return found?.value;
}

function helperOf(call, context) {
  const callee = skipped(call.callee);
  return resolveFunction(context, callee) ?? methodOf(context, callee);
}

export function createIo(context) {
  const { originOf } = createOrigins(context, clientSpec);
  return {
    ioKind: (call) => ioKind(call, { context, originOf }),
    helperOf: (call) => helperOf(call, context),
  };
}
