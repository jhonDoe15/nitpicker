import { ancestorsOf } from '../analysis/ancestry.mjs';
import { resolveFunction } from '../analysis/constant-resolution.mjs';
import { isGlobalFetch } from '../security/http/http-modules.mjs';
import { memberName } from '../security/security-values.mjs';
import { clientSpec } from './client-modules.mjs';
import { createOrigins, skipped } from './io-origin.mjs';

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

function methodOf(callee) {
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
  return resolveFunction(context, callee) ?? methodOf(callee);
}

export function createIo(context) {
  const { originOf } = createOrigins(context, clientSpec);
  return {
    ioKind: (call) => ioKind(call, { context, originOf }),
    helperOf: (call) => helperOf(call, context),
  };
}
