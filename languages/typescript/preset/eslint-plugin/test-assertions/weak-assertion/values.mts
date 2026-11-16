import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../rules/analysis/test-code-analysis.mts';

type MaybeNode = TSESTree.Node | undefined;
type Comparison = { readonly subject: TSESTree.Node; readonly bound: TSESTree.Node };

const UNDEFINED = 'undefined';
const LENGTH_NAMES = new Set(['length', 'size']);

function unwrapChain(node: MaybeNode): MaybeNode {
  return node?.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
}

export function nullishName(node: MaybeNode): 'null' | typeof UNDEFINED | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && node.value === null && node.raw === 'null') {
    return 'null';
  }
  if (node?.type === AST_NODE_TYPES.Identifier && node.name === UNDEFINED) {
    return UNDEFINED;
  }
  const isVoid = node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void';
  return isVoid && node.argument.type === AST_NODE_TYPES.Literal ? UNDEFINED : undefined;
}

export function isNumber(node: MaybeNode, expected: number): boolean {
  return (
    node?.type === AST_NODE_TYPES.Literal &&
    typeof node.value === 'number' &&
    node.value === expected
  );
}

export function lengthName(node: MaybeNode): string | undefined {
  const member = unwrapChain(node);
  const name = member?.type === AST_NODE_TYPES.MemberExpression ? memberName(member) : undefined;
  return name !== undefined && LENGTH_NAMES.has(name) ? name : undefined;
}

export function isEmptyLiteral(node: MaybeNode): boolean {
  if (node?.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.length === 0;
  }
  if (node?.type === AST_NODE_TYPES.Literal) {
    return node.value === '';
  }
  return (
    node?.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.cooked === ''
  );
}

const ORDERED = new Map<string, { lengthOnLeft: boolean; bound: number }>([
  ['>', { lengthOnLeft: true, bound: 0 }],
  ['<', { lengthOnLeft: false, bound: 0 }],
  ['>=', { lengthOnLeft: true, bound: 1 }],
  ['<=', { lengthOnLeft: false, bound: 1 }],
]);

const UNEQUAL = new Set(['!==', '!=']);

export function nonEmptyComparison(node: MaybeNode): Comparison | undefined {
  if (node?.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const ordered = ORDERED.get(node.operator);
  if (ordered) {
    const [subject, bound]: readonly [TSESTree.Node, TSESTree.Node] = ordered.lengthOnLeft
      ? [node.left, node.right]
      : [node.right, node.left];
    return lengthName(subject) !== undefined && isNumber(bound, ordered.bound)
      ? { subject, bound }
      : undefined;
  }
  if (!UNEQUAL.has(node.operator)) {
    return undefined;
  }
  const [subject, bound]: readonly [TSESTree.Node, TSESTree.Node] =
    lengthName(node.left) === undefined ? [node.right, node.left] : [node.left, node.right];
  return lengthName(subject) !== undefined && isNumber(bound, 0) ? { subject, bound } : undefined;
}

export function presenceComparison(
  node: MaybeNode,
): { readonly absent: string; readonly subject: TSESTree.Node } | undefined {
  if (node?.type !== AST_NODE_TYPES.BinaryExpression || !UNEQUAL.has(node.operator)) {
    return undefined;
  }
  const absent = nullishName(node.right) ?? nullishName(node.left);
  if (absent === undefined) {
    return undefined;
  }
  return { absent, subject: nullishName(node.right) === undefined ? node.right : node.left };
}
