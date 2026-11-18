import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../rules/loops/loop-shapes.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { contains } from '../../../rules/typed/node-views.mts';
import { visibleVariable } from '../../support/scope.mts';

const { DefinitionType } = TSESLint.Scope;

const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
  'assign',
]);
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

type Use = { readonly top: TSESTree.Node; readonly parent: TSESTree.Node };

function useOf(identifier: TSESTree.Identifier): Use {
  let top: TSESTree.Node = identifier;
  let parent: TSESTree.Node = identifier.parent;
  while (
    (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === top) ||
    parent.type === AST_NODE_TYPES.TSNonNullExpression ||
    parent.type === AST_NODE_TYPES.ChainExpression
  ) {
    top = parent;
    parent = parent.parent ?? parent;
  }
  return { top, parent };
}

function isScalar(context: Context, node: TSESTree.Node): boolean {
  const type = typeServices(context)?.getTypeAtLocation(node);
  if (type === undefined) {
    return false;
  }
  const members = type.isUnion() ? type.types : [type];
  return members.every((member) => (member.flags & SCALAR_FLAGS) !== 0);
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

function isUnsafeUse(context: Context, identifier: TSESTree.Identifier): boolean {
  const use = useOf(identifier);
  const { top, parent } = use;
  switch (parent.type) {
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.left === top || !isScalar(context, top);
    case AST_NODE_TYPES.UpdateExpression:
      return true;
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator === 'delete';
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.init === top && !isScalar(context, top);
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression:
      return isUnsafeCallUse(context, use);
    case AST_NODE_TYPES.Property:
      return parent.parent.type === AST_NODE_TYPES.ObjectPattern;
    default:
      return PATTERNS.has(parent.type) || parent.type === AST_NODE_TYPES.ForOfStatement;
  }
}

export function isItemStable(
  context: Context,
  item: TSESTree.Identifier,
  body: TSESTree.Node,
  target: TSESTree.Node,
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
  const variable = visibleVariable(context.sourceCode, iterable, iterable.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable && definition.parent?.kind === 'const';
}

export function isIterableStable(
  context: Context,
  iterable: TSESTree.Node,
  body: TSESTree.Node,
  target: TSESTree.Node,
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
