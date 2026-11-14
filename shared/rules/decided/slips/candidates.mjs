import { labelOfTag } from '../../../logic/bitvectors/widths.mjs';

const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const EQUALITIES = new Set(['==', '!=', '===', '!==']);
const FLIPPED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);
const COMPARERS = /^(?:[\w$.]+\.)?(?:compareTo|compare)\(/u;

function isZero(node) {
  return node?.kind === 'literal' && node.literal === 'number' && Number(node.value) === 0;
}

function isTypedDifference(node) {
  return node?.kind === 'binary' && node.value === '-' && node.bits !== undefined;
}

function positiveNumber(node) {
  const value = node?.kind === 'literal' && node.literal === 'number' ? Number(node.value) : 0;
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isAbsolute(node) {
  return node?.kind === 'call' && node.operation === 'abs' && node.bits !== undefined;
}

function differenceOf(node) {
  if (node.kind !== 'binary' || !COMPARISONS.has(node.value)) {
    return [];
  }
  const [left, right] = node.children;
  if (EQUALITIES.has(node.value)) {
    return [];
  }
  if (isTypedDifference(left) && isZero(right)) {
    return [{ kind: 'difference', node, difference: left, operator: node.value }];
  }
  const flipped = FLIPPED.get(node.value) ?? node.value;
  return isTypedDifference(right) && isZero(left)
    ? [{ kind: 'difference', node, difference: right, operator: flipped }]
    : [];
}

function remainderOf(node) {
  if (node.kind !== 'binary' || !COMPARISONS.has(node.value) || !EQUALITIES.has(node.value)) {
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
    ? [{ kind: 'remainder', node, dividend: found.side.children[0], remainder: found.other }]
    : [];
}

function isPromotedAbsolute(node) {
  return isAbsolute(node) && labelOfTag(node) === labelOfTag(node.children[1]);
}

function absoluteOf(node) {
  if (node.kind === 'binary' && node.value === '%' && isPromotedAbsolute(node.children[0])) {
    return [{ kind: 'absolute', node, argument: node.children[0].children[1], use: 'a bucket' }];
  }
  const isIndex = node.kind === 'index' && isPromotedAbsolute(node.children[1]);
  return isIndex
    ? [{ kind: 'absolute', node, argument: node.children[1].children[1], use: 'an index' }]
    : [];
}

function comparerReturn(statement, unitName) {
  const value = statement.kind === 'return' ? statement.children[0] : undefined;
  return COMPARERS.test(unitName) && isTypedDifference(value)
    ? [{ kind: 'comparer', node: value, difference: value }]
    : [];
}

function plainNodes(root) {
  const nodes = [];
  const pending = [root];
  for (const node of pending) {
    const isChain = node.kind === 'binary' && (node.value === '&&' || node.value === '||');
    nodes.push(node);
    if (node === root || (!isChain && node.kind !== 'lambda' && node.kind !== 'block')) {
      pending.push(...node.children);
    }
  }
  return nodes;
}

/**
 * The expressions in `root` that can slip on integer arithmetic: a difference compared with 0, a
 * `compareTo`/`compare` that returns a difference, a remainder compared with a positive value and
 * `Math.abs` used as a bucket or an index. Chains below `root` are checked as sites of their own.
 */
export function slipCandidates(root, unitName) {
  const nodes = plainNodes(root);
  return [
    ...comparerReturn(root, unitName),
    ...nodes.flatMap((node) => [...differenceOf(node), ...remainderOf(node), ...absoluteOf(node)]),
  ];
}
