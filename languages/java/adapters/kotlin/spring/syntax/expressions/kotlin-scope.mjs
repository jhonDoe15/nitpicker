const CLASS_NODES = new Set(['CLASS', 'OBJECT_DECLARATION']);

export function enclosingFunction(file, ancestors) {
  return ancestors
    .toReversed()
    .map((node) => file.functions.find((candidate) => candidate.node === node))
    .find((declaration) => declaration !== undefined);
}

export function insideAccessor(ancestors) {
  return ancestors.some((node) => node.t === 'PROPERTY_ACCESSOR');
}

export function outermostClass(ancestors) {
  return ancestors.find((node) => CLASS_NODES.has(node.t));
}

export function containsNode(region, node) {
  return region.s <= node.s && node.e <= region.e;
}

export function contextAt(file, ancestors) {
  const fn = enclosingFunction(file, ancestors);
  const owner = ancestors
    .toReversed()
    .map((node) => file.classes.find((candidate) => candidate.node === node))
    .find((candidate) => candidate !== undefined);
  return { file, scope: { owner, fn } };
}
