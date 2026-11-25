import { byText } from '../text-order/by-text.mts';
type Edge = { readonly source: string; readonly target: string };

function adjacency(nodes: readonly string[], edges: readonly Edge[]): Map<string, Set<string>> {
  const next = new Map(nodes.map((node): [string, Set<string>] => [node, new Set()]));
  for (const { source, target } of edges.filter((edge) => next.has(edge.target))) {
    next.get(source)?.add(target);
  }
  return next;
}

function reachable(
  start: string,
  next: ReadonlyMap<string, ReadonlySet<string>>,
  within?: ReadonlySet<string>,
): Set<string> {
  const seen = new Set([start]);
  for (const node of seen) {
    const targets = [...(next.get(node) ?? [])].filter((target) => within?.has(target) ?? true);
    for (const target of targets) {
      seen.add(target);
    }
  }
  return seen;
}

export function stronglyConnected(nodes: readonly string[], edges: readonly Edge[]): string[][] {
  const next = adjacency(nodes, edges);
  const previous = adjacency(
    nodes,
    edges.map(({ source, target }) => ({ source: target, target: source })),
  );
  const assigned = new Set<string>();
  const components: string[][] = [];
  for (const node of [...nodes].sort(byText)) {
    if (assigned.has(node)) {
      continue;
    }
    const component = [...reachable(node, previous, reachable(node, next))].sort(byText);
    for (const member of component) {
      assigned.add(member);
    }
    components.push(component);
  }
  return components.filter((component) => component.length > 1);
}
