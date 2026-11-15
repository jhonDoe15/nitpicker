import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf, type SourceCode } from '../../typed/node-views.mts';
import {
  astChildren,
  functionName,
  isFunctionNode,
  longLivedVariable,
  unwrapExpression,
  type FunctionNode,
} from '../scope/close-scopes.mts';

export type CacheBinding = { readonly text: string; readonly logical: boolean };
type Guard = {
  readonly sourceCode: SourceCode;
  readonly binding: CacheBinding;
  readonly fn: FunctionNode;
};

const CACHING_OPERATORS = new Set<string>(['=', '??=', '||=']);
const HANDLER_METHODS = new Set<string>(['catch', 'then', 'finally']);
const EQUALITY = new Set<string>(['===', '!==', '==', '!=']);

function nodesIn(root: TSESTree.Node): TSESTree.Node[] {
  return [...depthFirst(root, astChildren)];
}

function isThisField(expression: TSESTree.Node): boolean {
  return (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    expression.object.type === AST_NODE_TYPES.ThisExpression &&
    !expression.computed
  );
}

function outlivesCall(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  assignment: TSESTree.AssignmentExpression,
): boolean {
  const variable = longLivedVariable(sourceCode, assignment, identifier.name);
  return (
    variable !== undefined && variable.scope.block !== ancestorsOf(assignment).find(isFunctionNode)
  );
}

export function cacheBinding(
  sourceCode: SourceCode,
  assignment: TSESTree.AssignmentExpression,
): CacheBinding | undefined {
  if (!CACHING_OPERATORS.has(assignment.operator)) {
    return undefined;
  }
  const target = unwrapExpression(assignment.left);
  const kept =
    isThisField(target) ||
    (target.type === AST_NODE_TYPES.Identifier && outlivesCall(sourceCode, target, assignment));
  return kept
    ? { text: sourceCode.getText(target), logical: assignment.operator !== '=' }
    : undefined;
}

function isBinding(sourceCode: SourceCode, node: TSESTree.Node, binding: CacheBinding): boolean {
  return sourceCode.getText(unwrapExpression(node)) === binding.text;
}

function returnedValues(fn: FunctionNode): TSESTree.Node[] {
  const returns = nodesIn(fn.body).flatMap((node) =>
    node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null ? [node.argument] : [],
  );
  return fn.body.type === AST_NODE_TYPES.BlockStatement ? returns : [fn.body];
}

function readsBinding(
  sourceCode: SourceCode,
  value: TSESTree.Node,
  binding: CacheBinding,
): boolean {
  const inner = unwrapExpression(
    value.type === AST_NODE_TYPES.AwaitExpression ? value.argument : value,
  );
  return (
    isBinding(sourceCode, inner, binding) ||
    (inner.type === AST_NODE_TYPES.LogicalExpression &&
      isBinding(sourceCode, inner.left, binding)) ||
    (inner.type === AST_NODE_TYPES.AssignmentExpression &&
      isBinding(sourceCode, inner.left, binding))
  );
}

function logicalGuard(
  sourceCode: SourceCode,
  assignment: TSESTree.AssignmentExpression,
  binding: CacheBinding,
): boolean {
  const { parent } = assignment;
  return (
    binding.logical ||
    (parent.type === AST_NODE_TYPES.LogicalExpression &&
      parent.right === assignment &&
      isBinding(sourceCode, parent.left, binding))
  );
}

export function isGuarded(
  { sourceCode, binding, fn }: Guard,
  assignment: TSESTree.AssignmentExpression,
): boolean {
  if (logicalGuard(sourceCode, assignment, binding)) {
    return true;
  }
  const tested = nodesIn(fn.body).some(
    (node) =>
      (node.type === AST_NODE_TYPES.IfStatement ||
        node.type === AST_NODE_TYPES.ConditionalExpression) &&
      nodesIn(node.test).some((part) => isBinding(sourceCode, part, binding)),
  );
  return tested && returnedValues(fn).some((value) => readsBinding(sourceCode, value, binding));
}

function isClearValue(value: TSESTree.Node): boolean {
  const inner = unwrapExpression(value);
  return (
    (inner.type === AST_NODE_TYPES.Identifier && inner.name === 'undefined') ||
    (inner.type === AST_NODE_TYPES.Literal && inner.value === null) ||
    (inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === 'void')
  );
}

function isRejectionPath(node: TSESTree.Node, fn: TSESTree.Node): boolean {
  return ancestorsOf(node)
    .slice(0, ancestorsOf(node).indexOf(fn))
    .some(
      (ancestor) =>
        ancestor.type === AST_NODE_TYPES.CatchClause ||
        (ancestor.type === AST_NODE_TYPES.BlockStatement &&
          ancestor.parent.type === AST_NODE_TYPES.TryStatement &&
          ancestor.parent.finalizer === ancestor) ||
        (isFunctionNode(ancestor) &&
          ancestor.parent.type === AST_NODE_TYPES.CallExpression &&
          ancestor.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
          HANDLER_METHODS.has(nameOf(ancestor.parent.callee.property) ?? '')),
    );
}

function clearsIn(
  sourceCode: SourceCode,
  root: TSESTree.Node,
  binding: CacheBinding,
): TSESTree.AssignmentExpression[] {
  return nodesIn(root).filter(
    (node): node is TSESTree.AssignmentExpression =>
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.operator === '=' &&
      isBinding(sourceCode, node.left, binding) &&
      isClearValue(node.right),
  );
}

function calleeName(call: TSESTree.CallExpression): string | undefined {
  const callee = unwrapExpression(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function helperClears(
  sourceCode: SourceCode,
  fn: FunctionNode,
  binding: CacheBinding,
): TSESTree.AssignmentExpression[] {
  const owner = ancestorsOf(fn).find(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.ClassBody ||
      isFunctionNode(ancestor) ||
      ancestor.type === AST_NODE_TYPES.Program,
  );
  const names = nodesIn(fn.body).flatMap((node) =>
    node.type === AST_NODE_TYPES.CallExpression && isRejectionPath(node, fn)
      ? [calleeName(node)]
      : [],
  );
  if (owner === undefined) {
    return [];
  }
  return nodesIn(owner)
    .filter(
      (node): node is FunctionNode =>
        isFunctionNode(node) && node !== fn && names.includes(functionName(node)),
    )
    .flatMap((helper) => clearsIn(sourceCode, helper.body, binding));
}

export function rejectionClears(
  sourceCode: SourceCode,
  fn: FunctionNode,
  binding: CacheBinding,
): TSESTree.AssignmentExpression[] {
  return [
    ...clearsIn(sourceCode, fn.body, binding).filter((node) => isRejectionPath(node, fn)),
    ...helperClears(sourceCode, fn, binding),
  ];
}

function handlerOf(clear: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(clear).find(
    (ancestor) => ancestor.type === AST_NODE_TYPES.CatchClause || isFunctionNode(ancestor),
  );
}

export function checksIdentity(
  sourceCode: SourceCode,
  clear: TSESTree.AssignmentExpression,
  binding: CacheBinding,
): boolean {
  const handler = handlerOf(clear);
  return (
    handler !== undefined &&
    nodesIn(handler).some(
      (node) =>
        node.type === AST_NODE_TYPES.BinaryExpression &&
        EQUALITY.has(node.operator) &&
        (isBinding(sourceCode, node.left, binding) || isBinding(sourceCode, node.right, binding)),
    )
  );
}
