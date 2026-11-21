import { nodesOf } from '../tree/nodes.mts';
import type { TokenMasks, TreeNode } from '../tree/tree-types.mts';

const WORD_BITS = 32;
const WORD_SHIFT = 5;
const BIT_INDEX = WORD_BITS - 1;
const FULL_WORD = 0xffffffff;
const DICE_SCALE = 200;

export function tokenLabel(node: TreeNode): string {
  if (node.kind === 'name') {
    return node.binding === 'bound' ? 'b' : 'f';
  }
  if (node.kind === 'literal') {
    return `l:${node.literal ?? ''}`;
  }
  return `${node.kind}=${node.value ?? ''}`;
}

export function createVocabulary(): (root: TreeNode) => number[] {
  const ids = new Map<string, number>();
  function idOf(text: string): number {
    const known = ids.get(text);
    if (known !== undefined) {
      return known;
    }
    ids.set(text, ids.size);
    return ids.size - 1;
  }
  return (root) =>
    nodesOf(root)
      .filter((node) => node.kind !== 'none')
      .map((node) => idOf(tokenLabel(node)));
}

export function bagOf(tokens: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function bagOverlap(
  left: ReadonlyMap<number, number>,
  right: ReadonlyMap<number, number>,
): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let overlap = 0;
  for (const [token, count] of small) {
    overlap += Math.min(count, large.get(token) ?? 0);
  }
  return overlap;
}

export function matchMasks(tokens: readonly number[]): TokenMasks {
  const words = (tokens.length + BIT_INDEX) >>> WORD_SHIFT;
  const masks = new Map<number, Uint32Array>();
  for (const [index, token] of tokens.entries()) {
    const known = masks.get(token);
    const mask = known ?? new Uint32Array(words);
    if (known === undefined) {
      masks.set(token, mask);
    }
    mask[index >>> WORD_SHIFT] = (mask[index >>> WORD_SHIFT] ?? 0) | (1 << (index & BIT_INDEX));
  }
  return { masks, length: tokens.length, words };
}

function advance(row: Uint32Array, mask: Uint32Array): void {
  let carry = 0;
  for (const word of row.keys()) {
    const current = row[word] ?? 0;
    const bits = mask[word] ?? 0;
    const kept = current & ~bits;
    const sum = current + ((current & bits) >>> 0) + carry;
    carry = sum > FULL_WORD ? 1 : 0;
    row[word] = (sum >>> 0) | kept;
  }
}

function zeroBits(word: number, bits: number): number {
  return Array.from({ length: bits }, (_, bit) => (word >>> bit) & 1).filter((value) => value === 0)
    .length;
}

export function lcsLength(left: TokenMasks, tokens: readonly number[]): number {
  const row = new Uint32Array(left.words).fill(FULL_WORD);
  for (const token of tokens) {
    const mask = left.masks.get(token);
    if (mask !== undefined) {
      advance(row, mask);
    }
  }
  return [...row.keys()].reduce(
    (length, word) =>
      length + zeroBits(row[word] ?? 0, Math.min(WORD_BITS, left.length - word * WORD_BITS)),
    0,
  );
}

export function similarEnough(
  common: number,
  [leftLength, rightLength]: readonly [number, number],
  percent: number,
): boolean {
  return DICE_SCALE * common >= percent * (leftLength + rightLength);
}
