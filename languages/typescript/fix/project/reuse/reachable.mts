import type { ProjectGraph } from '../typed/reuse-views.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

export function reachable(graph: ProjectGraph, from: string, target: string): boolean {
  const dependencies = new Map(
    graph.modules.map(({ source, dependencies: found }) => [
      source,
      found.map(({ resolved }) => resolved),
    ]),
  );
  const seen = new Set<string>();
  const pending = [from];
  for (const name of pending) {
    if (name === target) {
      return true;
    }
    if (!seen.has(name)) {
      seen.add(name);
      appendAll(pending, dependencies.get(name) ?? []);
    }
  }
  return false;
}
