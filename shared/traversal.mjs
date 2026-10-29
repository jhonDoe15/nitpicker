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
    for (const child of children(node).toReversed()) {
      pending.push(child);
    }
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

export function objectChildren(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && typeof value === 'object');
}
