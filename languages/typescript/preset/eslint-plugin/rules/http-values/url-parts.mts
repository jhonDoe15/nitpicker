import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import type { Context } from '../security/security-values.mts';
import { isUrlLike } from './origins/receivers.mts';
import { type Finding, nameOf, unwrap } from './origins/http-origins.mts';

type MaybeNode = TSESTree.Node | undefined;
type Operands = readonly [TSESTree.Node, MaybeNode];

const URL_PARTS = new Set(['protocol', 'hostname', 'host', 'origin']);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const TEXT_METHODS = new Set(['startsWith', 'endsWith', 'includes']);

function urlPart(context: Context, node: MaybeNode): string | undefined {
  const member = unwrap(node);
  if (member?.type !== AST_NODE_TYPES.MemberExpression || member.computed) {
    return undefined;
  }
  const part = nameOf(member);
  const owner = part !== undefined && URL_PARTS.has(part) ? unwrap(member.object) : undefined;
  return owner !== undefined && isUrlLike(context, owner, nameOf(owner)) ? part : undefined;
}

function capitals(node: MaybeNode): boolean {
  return /[A-Z]/.test(stringValue(unwrap(node)) ?? '');
}

function operandsOf(node: TSESTree.Node): Operands | undefined {
  if (node.type === AST_NODE_TYPES.BinaryExpression && EQUALITY.has(node.operator)) {
    return capitals(node.right) ? [node.left, node.right] : [node.right, node.left];
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrap(node.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression && TEXT_METHODS.has(nameOf(callee) ?? '')
    ? [callee.object, node.arguments[0]]
    : undefined;
}

export function urlCase(context: Context, node: TSESTree.Node): Finding | undefined {
  const pair = operandsOf(node);
  const part = pair === undefined ? undefined : urlPart(context, pair[0]);
  return pair !== undefined && part !== undefined && capitals(pair[1])
    ? { node, messageId: 'urlCase', data: { part } }
    : undefined;
}
