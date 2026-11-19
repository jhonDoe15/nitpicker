import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import { foldTree, nameOf } from '../typed/node-views.mts';

const PATH_JOINS = new Set(['join', 'resolve']);
const WRAPPERS = new Set(['String', 'Number', 'BigInt']);
const MAX_DEPTH = 6;
const CLOCK = 'clock';
const CONSTANT = 'constant';

function isNamedCall(node: TSESTree.Node, owner: string, method: string): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    nameOf(node.callee.object) === owner &&
    nameOf(node.callee.property) === method
  );
}

function isTmpdirCall(node: TSESTree.Node): boolean {
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

type TimeKind = typeof CLOCK | typeof CONSTANT | undefined;

export function hasClock(context: SourceContext, node: TSESTree.Node): boolean {
  return timeKind(context, node) === CLOCK;
}

function mixKind(kinds: readonly TimeKind[]): TimeKind {
  if (kinds.some((kind) => kind === undefined)) {
    return undefined;
  }
  return kinds.includes(CLOCK) ? CLOCK : CONSTANT;
}

function isFixedTime(value: TSESTree.Node): boolean {
  return value.type === AST_NODE_TYPES.Literal || isTmpdirCall(value);
}

function callChildren(value: TSESTree.CallExpression): TSESTree.Node[] {
  const { callee } = value;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return WRAPPERS.has(nameOf(callee) ?? '') ? value.arguments : [];
  }
  if (nameOf(callee.object) === 'Math') {
    return nameOf(callee.property) === 'random' ? [] : value.arguments;
  }
  return [callee.object];
}

function timeChildren(value: TSESTree.Node): TSESTree.Node[] {
  if (isClockCall(value) || isNewDate(value) || isFixedTime(value)) {
    return [];
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions;
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return [value.left, value.right];
  }
  if (value.type === AST_NODE_TYPES.UnaryExpression && ['+', '-'].includes(value.operator)) {
    return [value.argument];
  }
  return value.type === AST_NODE_TYPES.CallExpression ? callChildren(value) : [];
}

function callKind(value: TSESTree.CallExpression, results: readonly TimeKind[]): TimeKind {
  const { callee } = value;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return WRAPPERS.has(nameOf(callee) ?? '') ? mixKind(results) : undefined;
  }
  if (nameOf(callee.object) === 'Math') {
    return nameOf(callee.property) === 'random' ? undefined : mixKind(results);
  }
  return results[0] === CLOCK ? CLOCK : undefined;
}

function timeOf(value: TSESTree.Node, results: readonly TimeKind[]): TimeKind {
  if (isClockCall(value) || isNewDate(value)) {
    return CLOCK;
  }
  if (isFixedTime(value)) {
    return CONSTANT;
  }
  if (
    value.type === AST_NODE_TYPES.TemplateLiteral ||
    value.type === AST_NODE_TYPES.BinaryExpression
  ) {
    return mixKind(results);
  }
  if (value.type === AST_NODE_TYPES.UnaryExpression && ['+', '-'].includes(value.operator)) {
    return results[0];
  }
  return value.type === AST_NODE_TYPES.CallExpression ? callKind(value, results) : undefined;
}

function resolved(context: SourceContext, node: TSESTree.Node): TSESTree.Node {
  return resolveConstant(context, unwrapOf(node, ASSERTION_FORMS)) ?? node;
}

function timeKind(context: SourceContext, node: TSESTree.Node): TimeKind {
  return foldTree<TSESTree.Node, number, TimeKind>(node, 0, {
    expand: (current, depth) =>
      depth > MAX_DEPTH
        ? []
        : timeChildren(resolved(context, current)).map((child) => [child, depth + 1] as const),
    combine: (current, depth, results) =>
      depth > MAX_DEPTH ? undefined : timeOf(resolved(context, current), results),
  });
}

export function isTimeOnlyText(context: SourceContext, node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.CallExpression && isJoin(value)) {
    return mixKind(value.arguments.map((argument) => timeKind(context, argument))) === 'clock';
  }
  const isText =
    value.type === AST_NODE_TYPES.TemplateLiteral ||
    value.type === AST_NODE_TYPES.CallExpression ||
    (value.type === AST_NODE_TYPES.BinaryExpression && hasStringPart(value));
  return isText && timeKind(context, value) === 'clock' && !isBareNumber(value);
}

function hasStringPart(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    if (item.type === AST_NODE_TYPES.BinaryExpression) {
      if (item.operator === '+') {
        pending.push(item.left, item.right);
      }
    } else if (
      item.type === AST_NODE_TYPES.TemplateLiteral ||
      (item.type === AST_NODE_TYPES.Literal && typeof item.value === 'string')
    ) {
      return true;
    }
  }
  return false;
}

function isBareNumber(node: TSESTree.Node): boolean {
  return (
    isClockCall(node) ||
    (node.type === AST_NODE_TYPES.UnaryExpression && isClockCall(node.argument))
  );
}

export function mentionsTmpdir(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    if (isTmpdirCall(item)) {
      return true;
    }
    if (item.type === AST_NODE_TYPES.TemplateLiteral) {
      appendAll(pending, item.expressions);
    } else if (item.type === AST_NODE_TYPES.BinaryExpression) {
      pending.push(item.left, item.right);
    } else if (item.type === AST_NODE_TYPES.CallExpression && isJoin(item)) {
      appendAll(pending, item.arguments);
    }
  }
  return false;
}
