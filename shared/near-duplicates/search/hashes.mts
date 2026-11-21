import { categoryOf, rebuild } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';
import { tokenLabel } from './tokens.mts';

const SEEDS = [0x811c9dc5, 0x2545f491];
const STEPS = [0x9e3779b9, 0x7f4a7c15];
const PRIME = 0x01000193;

type Hashed = { readonly hashes: readonly number[]; readonly size: number };
type Options = { readonly minNodes: number; readonly window: number };

function mix(hash: number, value: number): number {
  return Math.imul(hash ^ value, PRIME) >>> 0;
}

function textHash(text: string, seed: number): number {
  return Array.from(text).reduce(
    (hash, character) => mix(hash, character.codePointAt(0) ?? 0),
    seed,
  );
}

function combine(start: readonly number[], parts: readonly Hashed[]): number[] {
  return start.map((seed, lane) =>
    parts.reduce((hash, part) => mix(mix(hash, part.hashes[lane] ?? 0), STEPS[lane] ?? 0), seed),
  );
}

function windowKeys(children: readonly Hashed[], options: Options): string[] {
  const starts = Array.from(
    { length: Math.max(0, children.length - options.window + 1) },
    (_, index) => index,
  );
  return starts
    .map((from) => children.slice(from, from + options.window))
    .filter((window) => window.reduce((total, child) => total + child.size, 0) >= options.minNodes)
    .map((window) => `w${combine(SEEDS, window).join('.')}`);
}

export function statementHashes(tree: TreeNode, options: Options): Set<string> {
  const keys = new Set<string>();
  rebuild(tree, (node: TreeNode, children: Hashed[]): Hashed => {
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
