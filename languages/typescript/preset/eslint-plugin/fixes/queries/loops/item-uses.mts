import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../rules/loops/loop-shapes.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { hasOnlyTypeFlags } from '../../../rules/support/checked-types.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { ancestorsOf, contains } from '../../../rules/typed/node-views.mts';
import { MUTATING_METHODS } from './invariants.mts';
import { constDefinition } from '../../../rules/typed/syntax-views.mts';
import { visibleVariable } from '../../support/scope.mts';

const DELETE = 'delete';
const READING_METHODS = new Set([
  'toString',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'join',
  'slice',
  'at',
  'get',
  'has',
  'hasOwnProperty',
  'toISOString',
  'getTime',
  'valueOf',
  'localeCompare',
  'concat',
]);
const COLLECTING_METHODS = new Set(['push', 'unshift', 'add', 'set']);
const PURE_FUNCTIONS = new Set([
  'String',
  'Number',
  'Boolean',
  'BigInt',
  'parseInt',
  'parseFloat',
  'isNaN',
  'Array.isArray',
  'Number.isInteger',
  'Number.isFinite',
  'JSON.stringify',
  'Object.keys',
  'Object.values',
  'Object.entries',
  'Object.hasOwn',
  'Object.is',
]);
const SCALAR_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined;
const PATTERNS = new Set<string>([
  AST_NODE_TYPES.ArrayPattern,
  AST_NODE_TYPES.ObjectPattern,
  AST_NODE_TYPES.RestElement,
  AST_NODE_TYPES.AssignmentPattern,
]);

export type LoopScope = { readonly body: TSESTree.Node; readonly target: TSESTree.Node };
type Use = { readonly top: TSESTree.Node; readonly parent: TSESTree.Node };

function isTransparent(parent: TSESTree.Node, top: TSESTree.Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === top) ||
    parent.type === AST_NODE_TYPES.TSNonNullExpression ||
    parent.type === AST_NODE_TYPES.ChainExpression
  );
}

function useOf(identifier: TSESTree.Identifier): Use {
  let top: TSESTree.Node = identifier;
  for (const parent of ancestorsOf(identifier)) {
    if (!isTransparent(parent, top)) {
      return { top, parent };
    }
    top = parent;
  }
  return { top, parent: identifier.parent };
}

function isScalar(context: Context, node: TSESTree.Node): boolean {
  return hasOnlyTypeFlags(context, node, SCALAR_FLAGS);
}

function calleeText(context: Context, callee: TSESTree.Node): string {
  return context.sourceCode.getText(callee);
}

function isHarmlessCall(context: Context, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const text = calleeText(context, callee);
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : '';
  return (
    PURE_FUNCTIONS.has(text) ||
    text.startsWith('console.') ||
    text.startsWith('Math.') ||
    COLLECTING_METHODS.has(method)
  );
}

function methodName(top: TSESTree.Node): string {
  return top.type === AST_NODE_TYPES.MemberExpression &&
    top.property.type === AST_NODE_TYPES.Identifier
    ? top.property.name
    : '';
}

function isUnsafeCallUse(context: Context, { top, parent }: Use): boolean {
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === top) {
    const method = methodName(top);
    return MUTATING_METHODS.has(method) || !READING_METHODS.has(method);
  }
  if (parent.type === AST_NODE_TYPES.NewExpression) {
    return !isScalar(context, top);
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    !isHarmlessCall(context, parent) &&
    !isScalar(context, top)
  );
}

function isUnsafeOtherUse(context: Context, { top, parent }: Use): boolean {
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.left === top || !isScalar(context, top);
  }
  if (parent.type === AST_NODE_TYPES.UpdateExpression) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === DELETE;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === top && !isScalar(context, top);
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.parent.type === AST_NODE_TYPES.ObjectPattern;
  }
  return PATTERNS.has(parent.type) || parent.type === AST_NODE_TYPES.ForOfStatement;
}

function isUnsafeUse(context: Context, identifier: TSESTree.Identifier): boolean {
  const use = useOf(identifier);
  const { parent } = use;
  return parent.type === AST_NODE_TYPES.CallExpression ||
    parent.type === AST_NODE_TYPES.NewExpression
    ? isUnsafeCallUse(context, use)
    : isUnsafeOtherUse(context, use);
}

export function isItemStable(
  context: Context,
  item: TSESTree.Identifier,
  { body, target }: LoopScope,
): boolean {
  const variable = visibleVariable(context.sourceCode, item, item.name);
  return (variable?.references ?? [])
    .filter(
      (reference) =>
        !reference.init &&
        contains(body, reference.identifier) &&
        !contains(target, reference.identifier),
    )
    .every(
      (reference) =>
        reference.identifier.type === AST_NODE_TYPES.Identifier &&
        !reference.isWrite() &&
        !isUnsafeUse(context, reference.identifier),
    );
}

function isPureCall(context: Context, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : '';
  return isHarmlessCall(context, call) || READING_METHODS.has(method);
}

function isConstLocal(context: Context, iterable: TSESTree.Node): boolean {
  if (iterable.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return constDefinition(context, iterable) !== undefined;
}

export function isIterableStable(
  context: Context,
  iterable: TSESTree.Node,
  { body, target }: LoopScope,
): boolean {
  return (
    isConstLocal(context, iterable) ||
    descendants(body, context.sourceCode.visitorKeys, () => false).every(
      (node) =>
        (node.type !== AST_NODE_TYPES.CallExpression &&
          node.type !== AST_NODE_TYPES.NewExpression &&
          node.type !== AST_NODE_TYPES.TaggedTemplateExpression) ||
        contains(target, node) ||
        (node.type === AST_NODE_TYPES.CallExpression && isPureCall(context, node)),
    )
  );
}
