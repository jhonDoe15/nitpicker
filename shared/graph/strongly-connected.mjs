function adjacency(nodes, edges) {
  const next = new Map(nodes.map((node) => [node, new Set()]));
  for (const { source, target } of edges.filter((edge) => next.has(edge.target))) {
    next.get(source)?.add(target);
  }
  return next;
}

function reachable(start, next, within) {
  const seen = new Set([start]);
  for (const node of seen) {
    const targets = [...(next.get(node) ?? [])].filter((target) => within?.has(target) ?? true);
    for (const target of targets) {
      seen.add(target);
    }
  }
  return seen;
}

export function stronglyConnected(nodes, edges) {
  const next = adjacency(nodes, edges);
  const previous = adjacency(
    nodes,
    edges.map(({ source, target }) => ({ source: target, target: source })),
  );
  const assigned = new Set();
  const components = [];
  for (const node of [...nodes].sort()) {
    if (assigned.has(node)) {
      continue;
    }
    const component = [...reachable(node, previous, reachable(node, next))].sort();
    for (const member of component) {
      assigned.add(member);
    }
    components.push(component);
  }
  return components.filter((component) => component.length > 1);
}
