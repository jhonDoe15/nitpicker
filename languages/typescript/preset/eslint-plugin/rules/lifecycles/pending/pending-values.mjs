import { isFunctionNode, unwrapExpression } from '../scope/close-scopes.mjs';

const SETTLER_NAME = /^(?:resolve|reject|deferred|resolver|settle)$/u;
const PENDING_NAME = /pending|in-?flight|waiting|waiters|callbacksById|requests/iu;
const DEFERRED_CALLS = new Set(['deferred', 'defer', 'createDeferred', 'withResolvers']);
const SETTLER_TYPE =
  /^(?:Deferred|DeferredPromise|PromiseWithResolvers|Resolver)$|(?:Deferred|Resolver)$/u;

export function addedValue({ call, method }) {
  if (method === 'set') {
    return call.arguments[1];
  }
  return method === 'index' ? call.right : call.arguments[0];
}

function keysOf(object) {
  return object.properties
    .filter((property) => property.type === 'Property' && !property.computed)
    .map((property) => property.key.name ?? property.key.value);
}

function isSettler(expression, loose) {
  if (expression === undefined) {
    return false;
  }
  const value = unwrapExpression(expression);
  if (loose && (isFunctionNode(value) || value.type === 'Identifier')) {
    return true;
  }
  if (value.type === 'ObjectExpression') {
    const keys = keysOf(value);
    return keys.includes('resolve') && keys.includes('reject');
  }
  if (value.type === 'Identifier') {
    return SETTLER_NAME.test(value.name);
  }
  if (value.type === 'NewExpression') {
    return SETTLER_TYPE.test(value.callee.name ?? '');
  }
  const callee = value.type === 'CallExpression' ? value.callee : undefined;
  return callee !== undefined && DEFERRED_CALLS.has(callee.name ?? callee.property?.name);
}

function typeSettles(type, named) {
  if (type === undefined) {
    return false;
  }
  if (type.type === 'TSFunctionType') {
    return named;
  }
  if (type.type === 'TSTypeLiteral') {
    const names = type.members.map((member) => member.key?.name);
    return names.includes('resolve') && names.includes('reject');
  }
  return type.type === 'TSTypeReference' && SETTLER_TYPE.test(type.typeName.name ?? '');
}

function declaredTypes(binding) {
  const { node } = binding;
  const written =
    node.typeAnnotation?.typeAnnotation?.typeArguments ??
    node.typeAnnotation?.typeAnnotation?.typeParameters;
  const created =
    node.value?.typeArguments ?? node.init?.typeArguments ?? node.right?.typeArguments;
  const params = (written ?? created)?.params ?? [];
  return params.at(-1);
}

export function holdsSettlers(binding, values) {
  const named = PENDING_NAME.test(binding.name);
  return (
    values.some((value) => isSettler(value, named)) || typeSettles(declaredTypes(binding), named)
  );
}
