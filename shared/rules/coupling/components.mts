type ComponentEdge = { readonly source: string; readonly target: string };

function adjacencyOf(
  members: readonly string[],
  edges: readonly ComponentEdge[],
): Map<string, Set<string>> {
  const adjacency = new Map(members.map((member) => [member, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

function unvisitedNeighbors(
  current: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  visited: ReadonlySet<string>,
): string[] {
  return [...(adjacency.get(current) ?? [])].filter((neighbor) => !visited.has(neighbor));
}

function componentSize(
  start: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  visited: Set<string>,
): number {
  const pending = [start];
  visited.add(start);
  for (const current of pending) {
    for (const neighbor of unvisitedNeighbors(current, adjacency, visited)) {
      visited.add(neighbor);
      pending.push(neighbor);
    }
  }
  return pending.length;
}

export function connectedComponentSizes(
  members: readonly string[],
  edges: readonly ComponentEdge[],
): number[] {
  const adjacency = adjacencyOf(members, edges);
  const visited = new Set<string>();
  return members
    .map((member) => (visited.has(member) ? 0 : componentSize(member, adjacency, visited)))
    .filter((size) => size > 0)
    .sort((left, right) => right - left);
}
