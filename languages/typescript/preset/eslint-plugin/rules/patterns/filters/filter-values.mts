import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../security/security-values.mts';
import { operandsOf } from '../../typed/syntax-views.mts';
import {
  isEscapeCall,
  isEscapingLink,
  replaceReceiver,
  textReceiverOf,
} from '../replace-chains.mts';

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
  return textReceiverOf(node, TEXT_PRESERVING);
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

type Step = { readonly node: Node; readonly depth: number; readonly path: readonly number[] };
type Found = { readonly leaf: Node; readonly path: readonly number[] };
type Expansion = { readonly leaf: Node | undefined; readonly next: readonly Step[] };

type Child = { readonly node: Node; readonly index: number; readonly depth?: number };

function child(step: Step, { node, index, depth = step.depth }: Child): Step {
  return { node, depth, path: [...step.path, index] };
}

function expand(context: SourceContext, step: Step): Expansion {
  const target = chained(unwrapped(step.node));
  const inner = parts(target);
  if (inner.length > 0) {
    return {
      leaf: undefined,
      next: inner.map((part, index) => child(step, { node: part, index })),
    };
  }
  if (isEscapeCall(target) || isEscapingReplace(target) || isNamedEscaped(target)) {
    return { leaf: undefined, next: [] };
  }
  const receiver = textReceiver(target);
  if (receiver !== undefined) {
    return { leaf: undefined, next: [child(step, { node: receiver, index: 0 })] };
  }
  const resolved =
    target.type === AST_NODE_TYPES.Identifier && step.depth < MAX_DEPTH
      ? resolveConstant(context, target)
      : undefined;
  if (resolved !== undefined && resolved !== target) {
    return {
      leaf: undefined,
      next: [child(step, { node: resolved, index: 0, depth: step.depth + 1 })],
    };
  }
  const isLeaf =
    target.type === AST_NODE_TYPES.Identifier || target.type === AST_NODE_TYPES.MemberExpression;
  return { leaf: isLeaf ? target : undefined, next: [] };
}

function comparePaths(left: readonly number[], right: readonly number[]): number {
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? 0;
    if (value !== other) {
      return value - other;
    }
  }
  return 0;
}

export function unescapedLeaf(context: SourceContext, node: Node): Node | undefined {
  const pending: Step[] = [{ node, depth: 0, path: [] }];
  const found: Found[] = [];
  for (const step of pending) {
    const { leaf, next } = expand(context, step);
    if (leaf !== undefined) {
      found.push({ leaf, path: step.path });
    }
    for (const item of next) {
      pending.push(item);
    }
  }
  const first = found.reduce<Found | undefined>(
    (best, item) => (best === undefined || comparePaths(item.path, best.path) < 0 ? item : best),
    undefined,
  );
  return first?.leaf;
}
