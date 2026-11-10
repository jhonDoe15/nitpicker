import { categoryOf, rebuild } from '../tree/nodes.mjs';
import { tokenLabel } from './tokens.mjs';

const SEEDS = [0x811c9dc5, 0x2545f491];
const STEPS = [0x9e3779b9, 0x7f4a7c15];
const PRIME = 0x01000193;

function mix(hash, value) {
  return Math.imul(hash ^ value, PRIME) >>> 0;
}

function textHash(text, seed) {
  return [...text].reduce((hash, character) => mix(hash, character.codePointAt(0)), seed);
}

function combine(start, parts) {
  return start.map((seed, lane) =>
    parts.reduce((hash, part) => mix(mix(hash, part.hashes[lane]), STEPS[lane]), seed),
  );
}

function windowKeys(children, options) {
  const starts = Array.from(
    { length: Math.max(0, children.length - options.window + 1) },
    (_, index) => index,
  );
  return starts
    .map((from) => children.slice(from, from + options.window))
    .filter((window) => window.reduce((total, child) => total + child.size, 0) >= options.minNodes)
    .map((window) => `w${combine(SEEDS, window).join('.')}`);
}

export function statementHashes(tree, options) {
  const keys = new Set();
  rebuild(tree, (node, children) => {
    const hashes = combine(
      SEEDS.map((seed) => textHash(tokenLabel(node), seed)),
      children,
    );
    const size = children.reduce(
      (total, child) => total + child.size,
      node.kind === 'none' ? 0 : 1,
    );
    if (categoryOf(node) === 'statement' && size >= options.minNodes) {
      keys.add(`s${hashes.join('.')}`);
    }
    for (const key of node.kind === 'block' ? windowKeys(children, options) : []) {
      keys.add(key);
    }
    return { hashes, size };
  });
  return keys;
}
