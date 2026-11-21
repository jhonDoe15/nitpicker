import { labelOfTag } from '../../../logic/bitvectors/widths.mts';
import { appendAll } from '../../../lists/lists.mts';
import { isOneOf, present } from '../../../near-duplicates/tree/nodes.mts';
import type { FlowNode, SlipCandidate } from '../typed/decided-types.mts';

const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const EQUALITIES = new Set(['==', '!=', '===', '!==']);
const FLIPPED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const COMPARERS = /^(?:[\w$.]+\.)?(?:compareTo|compare)\(/u;

function isZero(node: FlowNode | undefined): boolean {
  return node?.kind === 'literal' && node.literal === 'number' && Number(node.value) === 0;
}

function isTypedDifference(node: FlowNode | undefined): node is FlowNode {
  return node?.kind === 'binary' && node.value === '-' && node.bits !== undefined;
}

function positiveNumber(node: FlowNode | undefined): number | undefined {
  const value = node?.kind === 'literal' && node.literal === 'number' ? Number(node.value) : 0;
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isAbsolute(node: FlowNode | undefined): node is FlowNode {
  return node?.kind === 'call' && node.operation === 'abs' && node.bits !== undefined;
}

function differenceOf(node: FlowNode): SlipCandidate[] {
  if (node.kind !== 'binary' || !isOneOf(COMPARISONS, node.value)) {
    return [];
  }
  const operator = present(node.value);
  const [left, right] = node.children;
  if (EQUALITIES.has(operator)) {
    return [];
  }
  if (isTypedDifference(left) && isZero(right)) {
    return [{ kind: 'difference', node, difference: left, operator }];
  }
  const flipped = FLIPPED.get(operator) ?? operator;
  return isTypedDifference(right) && isZero(left)
    ? [{ kind: 'difference', node, difference: right, operator: flipped }]
    : [];
}

function remainderOf(node: FlowNode): SlipCandidate[] {
  if (
    node.kind !== 'binary' ||
    !isOneOf(COMPARISONS, node.value) ||
    !isOneOf(EQUALITIES, node.value)
  ) {
    return [];
  }
  const sides = node.children;
  const found = sides
    .map((side, index) => ({ side, other: sides[1 - index] }))
    .find(
      ({ side, other }) =>
        side.kind === 'binary' && side.value === '%' && positiveNumber(other) !== undefined,
    );
  const modulus = found?.side.children[1];
  return found !== undefined && positiveNumber(modulus) !== undefined
    ? [
        {
          kind: 'remainder',
          node,
          dividend: present(found.side.children[0]),
          remainder: present(found.other),
        },
      ]
    : [];
}

function isPromotedAbsolute(node: FlowNode | undefined): node is FlowNode {
  return isAbsolute(node) && labelOfTag(node) === labelOfTag(present(node.children[1]));
}

function absoluteOf(node: FlowNode): SlipCandidate[] {
  const [first, second] = node.children;
  if (node.kind === 'binary' && node.value === '%' && isPromotedAbsolute(first)) {
    return [{ kind: 'absolute', node, argument: present(first.children[1]), use: 'a bucket' }];
  }
  return node.kind === 'index' && isPromotedAbsolute(second)
    ? [{ kind: 'absolute', node, argument: present(second.children[1]), use: 'an index' }]
    : [];
}

function comparerReturn(statement: FlowNode, unitName: string): SlipCandidate[] {
  const value = statement.kind === 'return' ? statement.children[0] : undefined;
  return COMPARERS.test(unitName) && isTypedDifference(value)
    ? [{ kind: 'comparer', node: value, difference: value }]
    : [];
}

function plainNodes(root: FlowNode): FlowNode[] {
  const nodes: FlowNode[] = [];
  const pending: FlowNode[] = [root];
  for (const node of pending) {
    const isChain = node.kind === 'binary' && (node.value === '&&' || node.value === '||');
    nodes.push(node);
    if (node === root || (!isChain && node.kind !== 'lambda' && node.kind !== 'block')) {
      appendAll(pending, node.children);
    }
  }
  return nodes;
}

export function slipCandidates(root: FlowNode, unitName: string): SlipCandidate[] {
  const nodes = plainNodes(root);
  return [
    ...comparerReturn(root, unitName),
    ...nodes.flatMap((node) => [...differenceOf(node), ...remainderOf(node), ...absoluteOf(node)]),
  ];
}
