import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { isFunction, type FunctionNode } from '../typed/syntax-views.mts';

const ITERATORS = new Set(['map', 'flatMap', 'forEach', 'filter']);
const ALWAYS_GUARDS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.AssignmentPattern,
]);
const GUARD_OPERATORS = new Set(['===', '!==', '==', '!=']);

export type UseNode = TSESTree.Identifier | TSESTree.JSXIdentifier;

type MappingCallback = FunctionNode & {
  parent: TSESTree.CallExpression & { callee: TSESTree.MemberExpression };
};

export function isCallback(fn: FunctionNode): fn is MappingCallback {
  const { parent } = fn;
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === fn &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    !parent.callee.computed &&
    ITERATORS.has(nameOf(parent.callee.property) ?? '')
  );
}

export function isGuard(reference: UseNode): boolean {
  const { parent } = reference;
  if (ALWAYS_GUARDS.has(parent.type)) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.IfStatement ||
    parent.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test === reference;
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression) {
    return GUARD_OPERATORS.has(parent.operator);
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === reference && parent.optional;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression && parent.callee === reference && parent.optional
  );
}

export function isUnchecked(reference: UseNode): boolean {
  const { parent } = reference;
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === reference && !parent.optional;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === reference)
  );
}

function isReturned(reference: UseNode): boolean {
  const { parent } = reference;
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === reference)
  );
}

function collectedVariable(call: TSESTree.CallExpression): TSESTree.Identifier | undefined {
  let holder: TSESTree.Node = call;
  if (call.parent.type === AST_NODE_TYPES.SpreadElement) {
    const array = call.parent.parent;
    if (array.type !== AST_NODE_TYPES.ArrayExpression) {
      return undefined;
    }
    holder = array;
  }
  const declarator = holder.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === holder &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function mappingCallbackOf(reference: TSESLint.Scope.Reference): MappingCallback | undefined {
  const member = reference.identifier.parent;
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== reference.identifier) {
    return undefined;
  }
  const call = member.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.callee !== member) {
    return undefined;
  }
  const [callback] = call.arguments;
  return callback !== undefined && isFunction(callback) && isCallback(callback)
    ? callback
    : undefined;
}

function firstParameterUse(
  sourceCode: Readonly<TSESLint.SourceCode>,
  callback: MappingCallback,
): UseNode | undefined {
  const [first] = callback.params;
  if (first?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const uses = sourceCode
    .getDeclaredVariables(callback)
    .find((candidate) => candidate.name === first.name)
    ?.references.filter((use) => use.identifier !== first);
  if (uses === undefined || uses.some((use) => isGuard(use.identifier))) {
    return undefined;
  }
  return uses.find((use) => isUnchecked(use.identifier))?.identifier;
}

function laterUse(
  sourceCode: Readonly<TSESLint.SourceCode>,
  collected: TSESTree.Identifier,
): UseNode | undefined {
  const variable = sourceCode
    .getDeclaredVariables(collected.parent)
    .find((candidate) => candidate.name === collected.name);
  for (const reference of variable?.references ?? []) {
    const callback = mappingCallbackOf(reference);
    const found = callback === undefined ? undefined : firstParameterUse(sourceCode, callback);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function returnedElementUse(
  sourceCode: Readonly<TSESLint.SourceCode>,
  fn: FunctionNode,
  references: readonly TSESLint.Scope.Reference[],
): UseNode | undefined {
  if (!isCallback(fn) || nameOf(fn.parent.callee.property) !== 'map') {
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
