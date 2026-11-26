import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { type FunctionNode } from '../typed/syntax-views.mts';

const ITERATORS = new Set(['map', 'flatMap', 'forEach', 'filter']);
const GUARD_OPERATORS = new Set(['===', '!==', '==', '!=']);

export function isCallback(
  fn: FunctionNode,
): fn is FunctionNode & { parent: TSESTree.CallExpression } {
  const { parent } = fn;
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === fn &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    !parent.callee.computed &&
    ITERATORS.has(nameOf(parent.callee.property) ?? '')
  );
}

export function isGuard(reference: TSESTree.Node): boolean {
  const { parent } = reference;
  if (parent === undefined) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.ConditionalExpression:
      return parent.test === reference;
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.AssignmentPattern:
      return true;
    case AST_NODE_TYPES.BinaryExpression:
      return GUARD_OPERATORS.has(parent.operator);
    case AST_NODE_TYPES.MemberExpression:
      return parent.object === reference && parent.optional;
    case AST_NODE_TYPES.CallExpression:
      return parent.callee === reference && parent.optional;
    default:
      return false;
  }
}

export function isUnchecked(reference: TSESTree.Node): boolean {
  const { parent } = reference;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === reference && !parent.optional;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.includes(reference as TSESTree.CallExpressionArgument)
  );
}

function isReturned(reference: TSESTree.Node): boolean {
  const { parent } = reference;
  return (
    parent?.type === AST_NODE_TYPES.ReturnStatement ||
    (parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === reference)
  );
}

function collectedVariable(call: TSESTree.CallExpression): TSESTree.Identifier | undefined {
  let holder: TSESTree.Node = call;
  if (call.parent.type === AST_NODE_TYPES.SpreadElement) {
    const array = call.parent.parent;
    if (array?.type !== AST_NODE_TYPES.ArrayExpression) {
      return undefined;
    }
    holder = array;
  }
  const declarator = holder.parent;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === holder &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function laterUse(
  sourceCode: Readonly<TSESLint.SourceCode>,
  collected: TSESTree.Identifier,
): TSESTree.Identifier | undefined {
  const variable = sourceCode
    .getDeclaredVariables(collected.parent)
    .find((candidate) => candidate.name === collected.name);
  for (const reference of variable?.references ?? []) {
    const member = reference.identifier.parent;
    const call = member?.parent;
    if (
      member?.type !== AST_NODE_TYPES.MemberExpression ||
      member.object !== reference.identifier ||
      call?.type !== AST_NODE_TYPES.CallExpression ||
      call.callee !== member
    ) {
      continue;
    }
    const [callback] = call.arguments;
    if (
      callback === undefined ||
      !('params' in callback) ||
      !isCallback(callback as FunctionNode)
    ) {
      continue;
    }
    const [first] = callback.params;
    if (first?.type !== AST_NODE_TYPES.Identifier) {
      continue;
    }
    const uses = sourceCode
      .getDeclaredVariables(callback)
      .find((candidate) => candidate.name === first.name)
      ?.references.filter((use) => use.identifier !== first);
    if (uses?.some((use) => isGuard(use.identifier))) {
      continue;
    }
    const found = uses?.find((use) => isUnchecked(use.identifier));
    if (found?.identifier.type === AST_NODE_TYPES.Identifier) {
      return found.identifier;
    }
  }
  return undefined;
}

export function returnedElementUse(
  sourceCode: Readonly<TSESLint.SourceCode>,
  fn: FunctionNode,
  references: readonly TSESLint.Scope.Reference[],
): TSESTree.Identifier | undefined {
  if (
    !isCallback(fn) ||
    nameOf((fn.parent.callee as TSESTree.MemberExpression).property) !== 'map'
  ) {
    return undefined;
  }
  if (references.some((reference) => isGuard(reference.identifier))) {
    return undefined;
  }
  if (!references.some((reference) => isReturned(reference.identifier))) {
    return undefined;
  }
  const collected = collectedVariable(fn.parent);
  return collected === undefined ? undefined : laterUse(sourceCode, collected);
}
