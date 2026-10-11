const effectHooks = new Set(['useEffect', 'useLayoutEffect']);
const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export function isFunctionNode(node) {
  return functionTypes.has(node.type);
}

export function hookName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  const isReactMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'React';
  return isReactMember ? callee.property.name : undefined;
}

export function isEffectCallback(node) {
  const call = node.parent;
  return (
    isFunctionNode(node) &&
    call.type === 'CallExpression' &&
    call.arguments[0] === node &&
    effectHooks.has(hookName(call.callee))
  );
}
