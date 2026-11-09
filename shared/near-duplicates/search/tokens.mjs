import { nodesOf } from '../tree/nodes.mjs';

const WORD_BITS = 32;
const WORD_SHIFT = 5;
const BIT_INDEX = WORD_BITS - 1;
const FULL_WORD = 0xffffffff;
const DICE_SCALE = 200;

export function tokenLabel(node) {
  if (node.kind === 'name') {
    return node.binding === 'bound' ? 'b' : 'f';
  }
  if (node.kind === 'literal') {
    return `l:${node.literal ?? ''}`;
  }
  return `${node.kind}=${node.value ?? ''}`;
}

export function createVocabulary() {
  const ids = new Map();
  function idOf(text) {
    if (!ids.has(text)) {
      ids.set(text, ids.size);
    }
    return ids.get(text);
  }
  return (root) =>
    nodesOf(root)
      .filter((node) => node.kind !== 'none')
      .map((node) => idOf(tokenLabel(node)));
}

export function bagOf(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function bagOverlap(left, right) {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let overlap = 0;
  for (const [token, count] of small) {
    overlap += Math.min(count, large.get(token) ?? 0);
  }
  return overlap;
}

export function matchMasks(tokens) {
  const words = (tokens.length + BIT_INDEX) >>> WORD_SHIFT;
  const masks = new Map();
  for (const [index, token] of tokens.entries()) {
    if (!masks.has(token)) {
      masks.set(token, new Uint32Array(words));
    }
    masks.get(token)[index >>> WORD_SHIFT] |= 1 << (index & BIT_INDEX);
  }
  return { masks, length: tokens.length, words };
}

function advance(row, mask) {
  let carry = 0;
  for (const word of row.keys()) {
    const kept = row[word] & ~mask[word];
    const sum = row[word] + ((row[word] & mask[word]) >>> 0) + carry;
    carry = sum > FULL_WORD ? 1 : 0;
    row[word] = (sum >>> 0) | kept;
  }
}

function zeroBits(word, bits) {
  return Array.from({ length: bits }, (_, bit) => (word >>> bit) & 1).filter((value) => value === 0)
    .length;
}

export function lcsLength(left, tokens) {
  const row = new Uint32Array(left.words).fill(FULL_WORD);
  for (const token of tokens) {
    const mask = left.masks.get(token);
    if (mask !== undefined) {
      advance(row, mask);
    }
  }
  return [...row.keys()].reduce(
    (length, word) =>
      length + zeroBits(row[word], Math.min(WORD_BITS, left.length - word * WORD_BITS)),
    0,
  );
}

export function similarEnough(common, [leftLength, rightLength], percent) {
  return DICE_SCALE * common >= percent * (leftLength + rightLength);
}
