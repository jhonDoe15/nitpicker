import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

const PATH_JOINS = new Set(['join', 'resolve']);
const WRAPPERS = new Set(['String', 'Number', 'BigInt']);
const MAX_DEPTH = 6;

export function isNamedCall(node: TSESTree.Node, owner: string, method: string): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    nameOf(node.callee.object) === owner &&
    nameOf(node.callee.property) === method
  );
}

export function isTmpdirCall(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    (nameOf(node.callee) === 'tmpdir' ||
      (node.callee.type === AST_NODE_TYPES.MemberExpression &&
        nameOf(node.callee.property) === 'tmpdir'))
  );
}

export function isJoin(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    PATH_JOINS.has(
      (node.callee.type === AST_NODE_TYPES.MemberExpression
        ? nameOf(node.callee.property)
        : nameOf(node.callee)) ?? '',
    )
  );
}

function isClockCall(node: TSESTree.Node): boolean {
  return isNamedCall(node, 'Date', 'now') || isNamedCall(node, 'performance', 'now');
}

function isNewDate(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    nameOf(node.callee) === 'Date' &&
    node.arguments.length === 0
  );
}

export function hasClock(context: SourceContext, node: TSESTree.Node, depth = 0): boolean {
  return timeKind(context, node, depth) === 'clock';
}

function mixKind(kinds: readonly (string | undefined)[]): 'clock' | 'constant' | undefined {
  if (kinds.some((kind) => kind === undefined)) {
    return undefined;
  }
  return kinds.includes('clock') ? 'clock' : 'constant';
}

function timeKind(
  context: SourceContext,
  node: TSESTree.Node,
  depth: number,
): 'clock' | 'constant' | undefined {
  const value = resolveConstant(context, unwrapOf(node, ASSERTION_FORMS)) ?? node;
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  const next = (child: TSESTree.Node) => timeKind(context, child, depth + 1);
  if (isClockCall(value) || isNewDate(value)) {
    return 'clock';
  }
  if (value.type === AST_NODE_TYPES.Literal || isTmpdirCall(value)) {
    return 'constant';
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return mixKind(value.expressions.map(next));
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return mixKind([next(value.left), next(value.right)]);
  }
  if (value.type === AST_NODE_TYPES.UnaryExpression && ['+', '-'].includes(value.operator)) {
    return next(value.argument);
  }
  return value.type === AST_NODE_TYPES.CallExpression ? callKind(value, next) : undefined;
}

function callKind(
  value: TSESTree.CallExpression,
  next: (child: TSESTree.Node) => 'clock' | 'constant' | undefined,
): 'clock' | 'constant' | undefined {
  const { callee } = value;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return WRAPPERS.has(nameOf(callee) ?? '') ? mixKind(value.arguments.map(next)) : undefined;
  }
  if (nameOf(callee.object) === 'Math') {
    return nameOf(callee.property) === 'random' ? undefined : mixKind(value.arguments.map(next));
  }
  return next(callee.object) === 'clock' ? 'clock' : undefined;
}

export function isTimeOnlyText(context: SourceContext, node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.CallExpression && isJoin(value)) {
    return mixKind(value.arguments.map((argument) => timeKind(context, argument, 0))) === 'clock';
  }
  const isText =
    value.type === AST_NODE_TYPES.TemplateLiteral ||
    value.type === AST_NODE_TYPES.CallExpression ||
    (value.type === AST_NODE_TYPES.BinaryExpression && hasStringPart(value));
  return isText && timeKind(context, value, 0) === 'clock' && !isBareNumber(value);
}

function hasStringPart(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.operator === '+' && (hasStringPart(node.left) || hasStringPart(node.right));
  }
  return (
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string')
  );
}

function isBareNumber(node: TSESTree.Node): boolean {
  return (
    isClockCall(node) ||
    (node.type === AST_NODE_TYPES.UnaryExpression && isClockCall(node.argument))
  );
}

export function mentionsTmpdir(node: TSESTree.Node): boolean {
  if (isTmpdirCall(node)) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.some(mentionsTmpdir);
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return mentionsTmpdir(node.left) || mentionsTmpdir(node.right);
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    isJoin(node) &&
    node.arguments.some(mentionsTmpdir)
  );
}
