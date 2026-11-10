import { createHash } from 'node:crypto';
import { depthFirst } from '../../traversal.mjs';

export const KEY_MODES = Object.freeze({
  exact: Object.freeze({ bound: 'number', values: true }),
  shape: Object.freeze({ bound: 'erase', values: true }),
  abstract: Object.freeze({ bound: 'number', values: false }),
  own: Object.freeze({ bound: 'id', values: true }),
});

const CLOSE = Object.freeze({ close: true });

function boundLabel(node, mode, numbers) {
  if (mode.bound === 'erase') {
    const position = mode.parameters?.get(node.value);
    return position === undefined ? 'b' : `p${position}`;
  }
  if (mode.bound === 'id') {
    return `b=${JSON.stringify(node.value)}`;
  }
  if (!numbers.has(node.value)) {
    numbers.set(node.value, numbers.size);
  }
  return `b${numbers.get(node.value)}`;
}

function nameLabel(node, mode, numbers) {
  if (node.binding === 'bound') {
    return boundLabel(node, mode, numbers);
  }
  return mode.values ? `f=${JSON.stringify(node.value)}` : 'f';
}

function label(node, mode, numbers) {
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

function itemsOf(item) {
  return item === CLOSE ? [] : [...item.children, CLOSE];
}

export function keyOf(root, mode = KEY_MODES.exact) {
  const numbers = new Map();
  const parts = [];
  for (const item of depthFirst(root, itemsOf)) {
    parts.push(item === CLOSE ? ')' : `(${label(item, mode, numbers)}`);
  }
  return parts.join('');
}

export function createKeyCache() {
  const caches = new Map(Object.values(KEY_MODES).map((mode) => [mode, new WeakMap()]));
  return function cachedKey(node, mode) {
    const cache = caches.get(mode);
    if (!cache.has(node)) {
      cache.set(node, keyOf(node, mode));
    }
    return cache.get(node);
  };
}

export function shapeMode(parameters) {
  return { ...KEY_MODES.shape, parameters };
}

export function parameterPositions(tree) {
  const list = tree.kind === 'function' ? tree.children[1].children : [];
  return new Map(
    list
      .map((parameter, index) => [parameter.children[1], index])
      .filter(([name]) => name?.kind === 'name' && name.binding === 'bound')
      .map(([name, index]) => [name.value, index]),
  );
}

export function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
