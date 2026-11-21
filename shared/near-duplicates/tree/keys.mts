import { createHash } from 'node:crypto';
import { depthFirst } from '../../traversal.mts';
import { isBound, present } from './nodes.mts';
import type { KeyCache, KeyMode, TreeNode } from './tree-types.mts';

export const KEY_MODES = Object.freeze({
  exact: Object.freeze<KeyMode>({ bound: 'number', values: true }),
  shape: Object.freeze<KeyMode>({ bound: 'erase', values: true }),
  abstract: Object.freeze<KeyMode>({ bound: 'number', values: false }),
  own: Object.freeze<KeyMode>({ bound: 'id', values: true }),
});

const CLOSE = Object.freeze({ close: true });

type Item = TreeNode | typeof CLOSE;

function isClose(item: Item): item is typeof CLOSE {
  return item === CLOSE;
}

function boundLabel(node: TreeNode, mode: KeyMode, numbers: Map<string | undefined, number>) {
  if (mode.bound === 'erase') {
    const position = node.value === undefined ? undefined : mode.parameters?.get(node.value);
    return position === undefined ? 'b' : `p${String(position)}`;
  }
  if (mode.bound === 'id') {
    return `b=${JSON.stringify(node.value)}`;
  }
  if (!numbers.has(node.value)) {
    numbers.set(node.value, numbers.size);
  }
  return `b${String(numbers.get(node.value))}`;
}

function nameLabel(node: TreeNode, mode: KeyMode, numbers: Map<string | undefined, number>) {
  if (node.binding === 'bound') {
    return boundLabel(node, mode, numbers);
  }
  return mode.values ? `f=${JSON.stringify(node.value)}` : 'f';
}

function label(node: TreeNode, mode: KeyMode, numbers: Map<string | undefined, number>) {
  if (node.kind === 'name') {
    return nameLabel(node, mode, numbers);
  }
  if (node.kind === 'literal') {
    const kind = `l:${node.literal ?? ''}`;
    return mode.values ? `${kind}=${JSON.stringify(node.value)}` : kind;
  }
  const value = node.value === undefined ? '' : `=${JSON.stringify(node.value)}`;
  return `${node.kind}${value}${node.commutes === true ? '#' : ''}`;
}

function itemsOf(item: Item): readonly Item[] {
  return isClose(item) ? [] : [...item.children, CLOSE];
}

export function keyOf(root: TreeNode, mode: KeyMode = KEY_MODES.exact): string {
  const numbers = new Map<string | undefined, number>();
  const parts = [];
  for (const item of depthFirst<Item>(root, itemsOf)) {
    parts.push(isClose(item) ? ')' : `(${label(item, mode, numbers)}`);
  }
  return parts.join('');
}

export function createKeyCache(): KeyCache {
  const caches = new Map(
    Object.values(KEY_MODES).map((mode) => [mode, new WeakMap<TreeNode, string>()]),
  );
  return function cachedKey(node, mode) {
    const cache = present(caches.get(mode));
    if (!cache.has(node)) {
      cache.set(node, keyOf(node, mode));
    }
    return present(cache.get(node));
  };
}

export function shapeMode(parameters: ReadonlyMap<string, number>): KeyMode {
  return { ...KEY_MODES.shape, parameters };
}

export function parameterPositions(tree: TreeNode): Map<string, number> {
  const list = tree.kind === 'function' ? present(tree.children[1]).children : [];
  return new Map(
    list.flatMap((parameter, index): [string, number][] => {
      const name = parameter.children[1];
      return isBound(name) ? [[name.value, index]] : [];
    }),
  );
}

export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
