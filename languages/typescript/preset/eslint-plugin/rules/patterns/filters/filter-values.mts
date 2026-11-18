import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../security/security-values.mts';
import { calleeNameOf, operandsOf } from '../../typed/syntax-views.mts';
import { isEscapeCall, isEscapingLink, replaceReceiver } from '../replace-chains.mts';

type Node = TSESTree.Node;

const ESCAPED_NAME = /escap|quot|sanitiz/iu;
const TEXT_PRESERVING = new Set<string>([
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'toString',
  'normalize',
]);
const MAX_DEPTH = 6;

function isEscapingReplace(node: Node): boolean {
  const call = replaceReceiver(node);
  return (
    call !== undefined &&
    isEscapingLink({
      call,
      pattern: call.arguments[0],
      replacement: stringValue(call.arguments[1]),
    })
  );
}

function textReceiver(node: Node): Node | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
    return TEXT_PRESERVING.has(calleeNameOf(node.callee) ?? '') ? node.callee.object : undefined;
  }
  return node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'String' &&
    node.arguments.length === 1
    ? node.arguments[0]
    : undefined;
}

function isNamedEscaped(node: Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && ESCAPED_NAME.test(node.name);
}

function parts(node: Node): readonly Node[] {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions;
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    return operandsOf(node, '+');
  }
  return node.type === AST_NODE_TYPES.ConditionalExpression
    ? [node.consequent, node.alternate]
    : [];
}

function chained(node: Node): Node {
  return node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

function findLeaf(context: SourceContext, node: Node, depth: number): Node | undefined {
  const target = chained(unwrapped(node));
  const inner = parts(target);
  if (inner.length > 0) {
    return inner.map((part) => findLeaf(context, part, depth)).find((leaf) => leaf !== undefined);
  }
  if (isEscapeCall(target) || isEscapingReplace(target) || isNamedEscaped(target)) {
    return undefined;
  }
  const receiver = textReceiver(target);
  if (receiver !== undefined) {
    return findLeaf(context, receiver, depth);
  }
  if (target.type === AST_NODE_TYPES.Identifier && depth < MAX_DEPTH) {
    const resolved = resolveConstant(context, target);
    if (resolved !== undefined && resolved !== target) {
      return findLeaf(context, resolved, depth + 1);
    }
  }
  return target.type === AST_NODE_TYPES.Identifier ||
    target.type === AST_NODE_TYPES.MemberExpression
    ? target
    : undefined;
}

export function unescapedLeaf(context: SourceContext, node: Node): Node | undefined {
  return findLeaf(context, node, 0);
}
