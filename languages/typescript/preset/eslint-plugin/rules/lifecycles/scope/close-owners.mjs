import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf, scopeChain } from '../../analysis/ancestry.mjs';
import {
  astChildren,
  chainEnd,
  functionName,
  isCloseName,
  isFunctionNode,
  unwrapExpression,
} from './close-scopes.mjs';

function containerOf(fn) {
  const { parent } = fn;
  if (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') {
    return parent.parent;
  }
  return ancestorsOf(fn).find(
    (ancestor) =>
      isFunctionNode(ancestor) || ancestor.type === 'ClassBody' || ancestor.type === 'Program',
  );
}

export function childrenOf(node) {
  return node.type === 'Program' ? node.body : astChildren(node);
}

export function closersOf(container) {
  return [...depthFirst(container, childrenOf)].filter(
    (node) =>
      isFunctionNode(node) && isCloseName(functionName(node)) && containerOf(node) === container,
  );
}

function thisField(expression) {
  const member = chainEnd(unwrapExpression(expression), (current) => {
    const inner = unwrapExpression(current);
    return inner.type === 'MemberExpression' && inner.object.type !== 'ThisExpression'
      ? inner.object
      : undefined;
  });
  const field = unwrapExpression(member);
  return field.type === 'MemberExpression' && field.object.type === 'ThisExpression'
    ? field
    : undefined;
}

export function rootIdentifier(expression) {
  const root = chainEnd(unwrapExpression(expression), (current) => {
    const inner = unwrapExpression(current);
    return inner.type === 'MemberExpression' ? inner.object : undefined;
  });
  const identifier = unwrapExpression(root);
  return identifier.type === 'Identifier' ? identifier : undefined;
}

function longLivedVariable(sourceCode, identifier) {
  const variable = scopeChain(sourceCode.getScope(identifier))
    .map((scope) => scope.set.get(identifier.name))
    .find((found) => found !== undefined);
  const kinds = ['function', 'module', 'global'];
  const declared = variable?.defs.every((definition) => definition.type === 'Variable');
  return declared === true && kinds.includes(variable.scope.type) ? variable : undefined;
}

function bindingOwner(sourceCode, expression) {
  const field = thisField(expression);
  if (field !== undefined) {
    const container = ancestorsOf(field).find((ancestor) => ancestor.type === 'ClassBody');
    return container === undefined
      ? undefined
      : { container, name: field.property.name, field, kind: 'field' };
  }
  const identifier = rootIdentifier(expression);
  const variable = identifier && longLivedVariable(sourceCode, identifier);
  return variable
    ? { container: variable.scope.block, name: identifier.name, variable, kind: 'variable' }
    : undefined;
}

export function closeScope(sourceCode, expression) {
  const owner = bindingOwner(sourceCode, expression);
  const closers = owner === undefined ? [] : closersOf(owner.container);
  return closers.length === 0 ? undefined : { ...owner, closers };
}
