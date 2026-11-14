import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf, scopeChain } from '../../analysis/ancestry.mjs';
import {
  astChildren,
  functionName,
  isFunctionNode,
  unwrapExpression,
} from '../scope/close-scopes.mjs';

const CACHING_OPERATORS = new Set(['=', '??=', '||=']);
const HANDLER_METHODS = new Set(['catch', 'then', 'finally']);
const EQUALITY = new Set(['===', '!==', '==', '!=']);

function nodesIn(root) {
  return [...depthFirst(root, astChildren)];
}

function isThisField(expression) {
  return (
    expression.type === 'MemberExpression' &&
    expression.object.type === 'ThisExpression' &&
    !expression.computed
  );
}

function outlivesCall(sourceCode, identifier, assignment) {
  const variable = scopeChain(sourceCode.getScope(assignment))
    .map((scope) => scope.set.get(identifier.name))
    .find((found) => found !== undefined);
  const declared = variable?.defs.every((definition) => definition.type === 'Variable');
  return (
    declared === true &&
    variable.scope.block !== ancestorsOf(assignment).find(isFunctionNode) &&
    ['function', 'module', 'global'].includes(variable.scope.type)
  );
}

export function cacheBinding(sourceCode, assignment) {
  if (!CACHING_OPERATORS.has(assignment.operator)) {
    return undefined;
  }
  const target = unwrapExpression(assignment.left);
  const kept =
    isThisField(target) ||
    (target.type === 'Identifier' && outlivesCall(sourceCode, target, assignment));
  return kept
    ? { text: sourceCode.getText(target), logical: assignment.operator !== '=' }
    : undefined;
}

function isBinding(sourceCode, node, binding) {
  return sourceCode.getText(unwrapExpression(node)) === binding.text;
}

function returnedValues(fn) {
  const returns = nodesIn(fn.body)
    .filter((node) => node.type === 'ReturnStatement' && node.argument !== null)
    .map((node) => node.argument);
  return fn.body.type === 'BlockStatement' ? returns : [fn.body];
}

function readsBinding(sourceCode, value, binding) {
  const inner = unwrapExpression(value.type === 'AwaitExpression' ? value.argument : value);
  return (
    isBinding(sourceCode, inner, binding) ||
    (inner.type === 'LogicalExpression' && isBinding(sourceCode, inner.left, binding)) ||
    (inner.type === 'AssignmentExpression' && isBinding(sourceCode, inner.left, binding))
  );
}

function logicalGuard(sourceCode, assignment, binding) {
  const { parent } = assignment;
  return (
    binding.logical ||
    (parent.type === 'LogicalExpression' &&
      parent.right === assignment &&
      isBinding(sourceCode, parent.left, binding))
  );
}

export function isGuarded({ sourceCode, binding, fn }, assignment) {
  if (logicalGuard(sourceCode, assignment, binding)) {
    return true;
  }
  const tested = nodesIn(fn.body).some(
    (node) =>
      (node.type === 'IfStatement' || node.type === 'ConditionalExpression') &&
      nodesIn(node.test).some((part) => isBinding(sourceCode, part, binding)),
  );
  return tested && returnedValues(fn).some((value) => readsBinding(sourceCode, value, binding));
}

function isClearValue(value) {
  const inner = unwrapExpression(value);
  return (
    (inner.type === 'Identifier' && inner.name === 'undefined') ||
    (inner.type === 'Literal' && inner.value === null) ||
    (inner.type === 'UnaryExpression' && inner.operator === 'void')
  );
}

function isRejectionPath(node, fn) {
  return ancestorsOf(node)
    .slice(0, ancestorsOf(node).indexOf(fn))
    .some(
      (ancestor) =>
        ancestor.type === 'CatchClause' ||
        (ancestor.type === 'BlockStatement' &&
          ancestor.parent.type === 'TryStatement' &&
          ancestor.parent.finalizer === ancestor) ||
        (isFunctionNode(ancestor) &&
          ancestor.parent.type === 'CallExpression' &&
          ancestor.parent.callee.type === 'MemberExpression' &&
          HANDLER_METHODS.has(ancestor.parent.callee.property.name)),
    );
}

function clearsIn(sourceCode, root, binding) {
  return nodesIn(root).filter(
    (node) =>
      node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      isBinding(sourceCode, node.left, binding) &&
      isClearValue(node.right),
  );
}

function calleeName(call) {
  const callee = unwrapExpression(call.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function helperClears(sourceCode, fn, binding) {
  const owner = ancestorsOf(fn).find(
    (ancestor) =>
      ancestor.type === 'ClassBody' || isFunctionNode(ancestor) || ancestor.type === 'Program',
  );
  const names = nodesIn(fn.body)
    .filter((node) => node.type === 'CallExpression' && isRejectionPath(node, fn))
    .map(calleeName);
  return nodesIn(owner)
    .filter((node) => isFunctionNode(node) && node !== fn && names.includes(functionName(node)))
    .flatMap((helper) => clearsIn(sourceCode, helper.body, binding));
}

export function rejectionClears(sourceCode, fn, binding) {
  return [
    ...clearsIn(sourceCode, fn.body, binding).filter((node) => isRejectionPath(node, fn)),
    ...helperClears(sourceCode, fn, binding),
  ];
}

function handlerOf(clear) {
  return ancestorsOf(clear).find(
    (ancestor) => ancestor.type === 'CatchClause' || isFunctionNode(ancestor),
  );
}

export function checksIdentity(sourceCode, clear, binding) {
  return nodesIn(handlerOf(clear)).some(
    (node) =>
      node.type === 'BinaryExpression' &&
      EQUALITY.has(node.operator) &&
      (isBinding(sourceCode, node.left, binding) || isBinding(sourceCode, node.right, binding)),
  );
}
