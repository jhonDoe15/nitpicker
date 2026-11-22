import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { calleeName } from '../../analysis/node/call-text.mts';
import { type ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { calleeMethod } from '../process-callees.mts';

type MaybeNode = TSESTree.Node | undefined;

export const PROCESS_METHODS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'execa',
  'execaSync',
]);

const PATH_JOINERS = new Set(['join', 'resolve']);

export function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/gu, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length > 0);
}

export function bindingName(node: MaybeNode): string | undefined {
  if (node?.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (
    node?.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  ) {
    return node.property.name;
  }
  return undefined;
}

export function calleeIdentifierOrMember(call: TSESTree.CallExpression): string | undefined {
  return calleeName(unwrapped(call.callee));
}

function isPathJoinCall(node: TSESTree.CallExpression): boolean {
  const name = calleeIdentifierOrMember(node);
  return name !== undefined && PATH_JOINERS.has(name);
}

export function joinedPathText(
  context: SourceContext,
  call: TSESTree.CallExpression,
): string | undefined {
  if (!isPathJoinCall(call)) {
    return undefined;
  }
  const parts = call.arguments.map((arg) =>
    arg.type === AST_NODE_TYPES.SpreadElement
      ? 'X'
      : (stringValue(resolveConstant(context, arg)) ?? 'X'),
  );
  return parts.join('/');
}

export function staticCommandText(
  context: SourceContext,
  node: MaybeNode,
  allowConcat = false,
): string | undefined {
  const value = resolveConstant(context, node);
  const literal = stringValue(value);
  if (literal !== undefined) {
    return literal;
  }
  if (value?.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.quasis.map((quasi) => quasi.value.cooked ?? '').join('X');
  }
  if (allowConcat && value?.type === AST_NODE_TYPES.BinaryExpression && value.operator === '+') {
    const left = staticCommandText(context, value.left, true) ?? 'X';
    const right = staticCommandText(context, value.right, true) ?? 'X';
    return `${left}${right}`;
  }
  return value?.type === AST_NODE_TYPES.CallExpression ? joinedPathText(context, value) : undefined;
}

export function trackedProcessMethod(
  node: TSESTree.CallExpression,
  bindings: ModuleBindings,
): string | undefined {
  const method = calleeMethod(node.callee, bindings);
  if (
    method === undefined ||
    !PROCESS_METHODS.has(method) ||
    node.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  return method;
}
