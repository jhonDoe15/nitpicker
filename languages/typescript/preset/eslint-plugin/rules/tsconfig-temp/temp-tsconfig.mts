import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { type SourceContext } from '../analysis/constant-resolution.mts';
import { unwrapped } from '../security/security-values.mts';
import { isPlainString, nameOf } from '../typed/node-views.mts';
import {
  calleeNameOf,
  isNamedMember,
  resolvedThrough,
  TYPE_WRAPPERS,
} from '../typed/syntax-views.mts';
import { isJoin, isTmpdirCall } from '../unique-names/time-values.mts';

export const VALUE_WRAPPERS = [...TYPE_WRAPPERS, AST_NODE_TYPES.AwaitExpression];

const MAX_DEPTH = 8;
const TEMP_DIR_CALLS = new Set(['mkdtemp', 'mkdtempSync']);
const PATH_WRAPPERS = new Set(['realpath', 'realpathSync', 'normalize']);
const TEMP_ROOT = /^\/(?:var\/)?tmp(?:\/|$)/u;
const TSCONFIG_NAME = /tsconfig/iu;

type WorkItem = { readonly node: TSESTree.Node; readonly depth: number };

function isDirectTemp(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === 'string' && TEMP_ROOT.test(node.value);
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return TEMP_ROOT.test(node.quasis[0]?.value.cooked ?? '');
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = calleeNameOf(unwrapped(node.callee));
  return isTmpdirCall(node) || (callee !== undefined && TEMP_DIR_CALLS.has(callee));
}

function nonSpreadArguments(call: TSESTree.CallExpression): TSESTree.Node[] {
  return call.arguments.filter((arg) => arg.type !== AST_NODE_TYPES.SpreadElement);
}

function callPathChildren(call: TSESTree.CallExpression): TSESTree.Node[] {
  if (isJoin(call)) {
    return nonSpreadArguments(call);
  }
  const callee = calleeNameOf(unwrapped(call.callee));
  const [first] = call.arguments;
  if (
    callee !== undefined &&
    PATH_WRAPPERS.has(callee) &&
    first !== undefined &&
    first.type !== AST_NODE_TYPES.SpreadElement
  ) {
    return [first];
  }
  return [];
}

function pathChildren(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    return [node.left, node.right];
  }
  return node.type === AST_NODE_TYPES.CallExpression ? callPathChildren(node) : [];
}

export function isTempPath(context: SourceContext, start: TSESTree.Node): boolean {
  const pending: WorkItem[] = [{ node: start, depth: 0 }];
  const visited = new Set<TSESTree.Node>();
  for (const { node, depth } of pending) {
    const value = resolvedThrough(context, node, VALUE_WRAPPERS);
    if (value === undefined || depth > MAX_DEPTH || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (isDirectTemp(value)) {
      return true;
    }
    appendAll(
      pending,
      pathChildren(value).map((child) => ({ node: child, depth: depth + 1 })),
    );
  }
  return false;
}

function hasTsconfigText(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === 'string' && TSCONFIG_NAME.test(node.value);
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.some((quasi) => TSCONFIG_NAME.test(quasi.value.cooked ?? ''));
  }
  const identifier = nameOf(node);
  return identifier !== undefined && TSCONFIG_NAME.test(identifier);
}

export function mentionsTsconfig(context: SourceContext, start: TSESTree.Node): boolean {
  const pending: WorkItem[] = [{ node: start, depth: 0 }];
  const visited = new Set<TSESTree.Node>();
  for (const { node, depth } of pending) {
    if (hasTsconfigText(node)) {
      return true;
    }
    const value = resolvedThrough(context, node, VALUE_WRAPPERS);
    if (value === undefined || depth > MAX_DEPTH || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (hasTsconfigText(value)) {
      return true;
    }
    appendAll(
      pending,
      pathChildren(value).map((child) => ({ node: child, depth: depth + 1 })),
    );
  }
  return false;
}

function stringifyTarget(
  context: SourceContext,
  call: TSESTree.CallExpression,
): TSESTree.ObjectExpression | undefined {
  if (!isNamedMember(unwrapped(call.callee), 'JSON', 'stringify')) {
    return undefined;
  }
  const [first] = call.arguments;
  if (first === undefined || first.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  const target = resolvedThrough(context, first, VALUE_WRAPPERS);
  return target?.type === AST_NODE_TYPES.ObjectExpression ? target : undefined;
}

function unwrapSerializedText(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 1) {
    return node.expressions[0];
  }
  if (node.type !== AST_NODE_TYPES.BinaryExpression || node.operator !== '+') {
    return undefined;
  }
  if (isPlainString(unwrapped(node.right))) {
    return node.left;
  }
  return isPlainString(unwrapped(node.left)) ? node.right : undefined;
}

export function serializedConfig(
  context: SourceContext,
  start: TSESTree.Node,
): TSESTree.ObjectExpression | undefined {
  const pending: WorkItem[] = [{ node: start, depth: 0 }];
  for (const { node, depth } of pending) {
    const value = resolvedThrough(context, node, VALUE_WRAPPERS);
    if (value === undefined || depth > MAX_DEPTH) {
      continue;
    }
    if (value.type === AST_NODE_TYPES.CallExpression) {
      return stringifyTarget(context, value);
    }
    const inner = unwrapSerializedText(value);
    if (inner !== undefined) {
      pending.push({ node: inner, depth: depth + 1 });
    }
  }
  return undefined;
}
