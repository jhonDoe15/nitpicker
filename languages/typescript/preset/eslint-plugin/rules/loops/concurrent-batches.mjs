import { findVariable } from '../analysis/constant-resolution.mjs';

const CONCURRENT_COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const CALL = 'CallExpression';
const MEMBER = 'MemberExpression';

function isCombinatorCall(node) {
  const callee = node?.type === CALL ? node.callee : undefined;
  return (
    callee?.type === MEMBER &&
    callee.object.name === 'Promise' &&
    CONCURRENT_COMBINATORS.has(callee.property.name)
  );
}

function isCombinatorArgument(node) {
  return isCombinatorCall(node.parent) && node.parent.arguments.includes(node);
}

function isMethodCall(node, name) {
  return node?.type === CALL && node.callee.type === MEMBER && node.callee.property.name === name;
}

function isPushTarget(identifier) {
  const member = identifier.parent;
  return (
    member.type === MEMBER && member.object === identifier && isMethodCall(member.parent, 'push')
  );
}

function onlyCombined(variable, isAllowedUse) {
  const uses = variable?.references.filter((reference) => !reference.init) ?? [];
  const combined = uses.filter((reference) => isCombinatorArgument(reference.identifier));
  return (
    combined.length > 0 &&
    uses.every(
      (reference) =>
        isCombinatorArgument(reference.identifier) || isAllowedUse(reference.identifier),
    )
  );
}

function boundArray(sourceCode, declarator) {
  const declaration = declarator.parent;
  if (declarator.id.type !== 'Identifier' || declaration.kind !== 'const') {
    return undefined;
  }
  return sourceCode.getDeclaredVariables(declarator)[0];
}

function mappedConstant(sourceCode, call) {
  const declarator = call.parent;
  if (declarator.type !== 'VariableDeclarator' || declarator.init !== call) {
    return false;
  }
  return onlyCombined(boundArray(sourceCode, declarator), () => false);
}

export function isConcurrentBatch(callback, sourceCode) {
  const call = callback.parent;
  return (
    isCombinatorCall(call.parent) || (isMethodCall(call, 'map') && mappedConstant(sourceCode, call))
  );
}

export function isPushedForConcurrency(call, sourceCode) {
  const push = call.parent;
  if (!isMethodCall(push, 'push') || !push.arguments.includes(call)) {
    return false;
  }
  const target = push.callee.object;
  if (target.type !== 'Identifier') {
    return false;
  }
  return onlyCombined(findVariable({ sourceCode }, target, target.name), isPushTarget);
}
