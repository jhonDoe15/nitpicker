export function reachable(graph, from, target) {
  const dependencies = new Map(
    graph.modules.map(({ source, dependencies: found }) => [
      source,
      found.map(({ resolved }) => resolved),
    ]),
  );
  const seen = new Set();
  const pending = [from];
  for (const name of pending) {
    if (name === target) {
      return true;
    }
    if (!seen.has(name)) {
      seen.add(name);
      pending.push(...(dependencies.get(name) ?? []));
    }
  }
  return false;
}
