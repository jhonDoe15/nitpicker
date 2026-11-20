import path from 'node:path';
import { appendAll } from './lists/items.mjs';

function stackIterator(items) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return items.length === 0
        ? { done: true, value: undefined }
        : { done: false, value: items.pop() };
    },
  };
}

export function whileHolds(value, holds) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return holds(value) ? { done: false, value } : { done: true, value: undefined };
    },
  };
}

export function* depthFirst(root, children) {
  const pending = [root];
  for (const node of stackIterator(pending)) {
    yield node;
    for (const child of children(node).toReversed()) {
      pending.push(child);
    }
  }
}

function pushReversed(pending, items) {
  if (items.length === 1) {
    pending.push(items[0]);
    return;
  }
  for (const item of items.toReversed()) {
    pending.push(item);
  }
}

/** The nodes `depthFirst` yields, as a list: the same order without a generator step per node. */
export function preOrder(root, children) {
  const nodes = [];
  const pending = [root];
  for (const node of stackIterator(pending)) {
    nodes.push(node);
    pushReversed(pending, children(node));
  }
  return nodes;
}

function expandItem(item, expand, pending) {
  const entries = expand(item.node, item.context);
  pending.push({ ...item, entries });
  for (const [node, context] of entries.toReversed()) {
    pending.push({ node, context });
  }
}

export function foldTree(root, context, { expand, combine }) {
  const pending = [{ node: root, context }];
  const results = [];
  for (const item of stackIterator(pending)) {
    if (item.entries === undefined) {
      expandItem(item, expand, pending);
    } else {
      const childResults = results.splice(results.length - item.entries.length);
      results.push(combine(item.node, item.context, childResults));
    }
  }
  return results[0];
}

export function chainOf(start, next) {
  const nodes = start ? [start] : [];
  for (const node of nodes) {
    const following = next(node);
    if (following) nodes.push(following);
  }
  return nodes;
}

export function parentDirectory(directory) {
  const parent = path.dirname(directory);
  return parent === directory ? undefined : parent;
}

export function objectChildren(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && typeof value === 'object');
}

export function expandsFully(root, children) {
  const pending = [root];
  for (const node of pending) {
    const next = children(node);
    if (next === undefined) {
      return false;
    }
    appendAll(pending, next);
  }
  return true;
}
