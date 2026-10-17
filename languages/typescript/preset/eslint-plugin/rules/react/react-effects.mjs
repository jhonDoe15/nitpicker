import { memberName } from '../analysis/test-code-analysis.mjs';
import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';

const effectHooks = new Set(['useEffect', 'useLayoutEffect']);
const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const REACT_PACKAGE = 'react';
const REACT_NAMESPACE = 'React';

export function isFunctionNode(node) {
  return functionTypes.has(node.type);
}

export function enclosingFunction(node) {
  return ancestorsOf(node).find(isFunctionNode);
}

function importDefinition(variable) {
  const definition = variable?.defs.find(({ type }) => type === 'ImportBinding');
  return definition?.parent.source.value === REACT_PACKAGE ? definition : undefined;
}

function namespaceName(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return identifier.name === REACT_NAMESPACE;
  }
  const definition = importDefinition(variable);
  return definition !== undefined && definition.node.type !== 'ImportSpecifier';
}

export function hookName(sourceCode, callee) {
  if (callee.type === 'Identifier') {
    const variable = variableNamed(sourceCode, callee);
    if (variable === undefined || variable.defs.length === 0) {
      return callee.name;
    }
    const definition = importDefinition(variable);
    return definition?.node.type === 'ImportSpecifier' ? definition.node.imported.name : undefined;
  }
  const isNamespaceMember =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    namespaceName(sourceCode, callee.object);
  return isNamespaceMember ? memberName(callee) : undefined;
}

export function isEffectCallback(sourceCode, node) {
  const call = node.parent;
  return (
    isFunctionNode(node) &&
    call.type === 'CallExpression' &&
    call.arguments[0] === node &&
    effectHooks.has(hookName(sourceCode, call.callee))
  );
}
