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

export function foldTree(root, children, combine) {
  const entries = [{ node: root, depth: 0, children: [] }];
  for (const entry of entries) {
    const nested = children(entry.node, entry.depth).map((node) => ({
      node,
      depth: entry.depth + 1,
      children: [],
    }));
    entry.children.push(...nested);
    entries.push(...nested);
  }
  const values = new Map();
  for (const entry of entries.toReversed()) {
    values.set(
      entry,
      combine(
        entry.node,
        entry.children.map((child) => values.get(child)),
      ),
    );
  }
  return values.get(entries[0]);
}
