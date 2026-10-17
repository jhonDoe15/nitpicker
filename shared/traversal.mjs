import path from 'node:path';

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

export function* depthFirst(root, children) {
  const pending = [root];
  for (const node of stackIterator(pending)) {
    yield node;
    pending.push(...children(node).toReversed());
  }
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
