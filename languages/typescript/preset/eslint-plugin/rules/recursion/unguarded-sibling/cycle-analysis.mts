import type { Entry, EntryCalls } from './call-graph.mts';
import type { GuardMap } from './reentry-guards.mts';

export type SiblingFinding = {
  readonly entry: Entry;
  readonly sibling: string;
  readonly guard: string;
};

type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

function adjacencyOf(calls: EntryCalls): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const [caller, sites] of calls) {
    adj.set(caller, new Set(sites.map((site) => site.target)));
  }
  return adj;
}

function enqueueUnvisited(
  neighbors: ReadonlySet<string> | undefined,
  blocked: ReadonlySet<string>,
  state: { readonly visited: Set<string>; readonly queue: string[] },
): void {
  for (const next of neighbors ?? []) {
    if (!blocked.has(next) && !state.visited.has(next)) {
      state.visited.add(next);
      state.queue.push(next);
    }
  }
}

function reachable(start: string, adj: Adjacency, blocked: ReadonlySet<string>): Set<string> {
  const state = { visited: new Set<string>(), queue: [] as string[] };
  enqueueUnvisited(adj.get(start), blocked, state);
  for (const current of state.queue) {
    enqueueUnvisited(adj.get(current), blocked, state);
  }
  return state.visited;
}

function guardsBeforeRecursion(
  entryGuards: ReadonlyMap<string, number>,
  guard: string,
  sites: readonly { readonly pos: number }[],
): boolean {
  const readPos = entryGuards.get(guard);
  return readPos !== undefined && sites.some((site) => site.pos > readPos);
}

function guardedEntriesFor(guard: string, guards: GuardMap, calls: EntryCalls): Set<string> {
  const guarded = new Set<string>();
  for (const [name, entryGuards] of guards) {
    if (guardsBeforeRecursion(entryGuards, guard, calls.get(name) ?? [])) {
      guarded.add(name);
    }
  }
  return guarded;
}

function allGuardNamesOf(guards: GuardMap): string[] {
  const names = new Set<string>();
  for (const entryGuards of guards.values()) {
    for (const guard of entryGuards.keys()) {
      names.add(guard);
    }
  }
  return [...names];
}

function sharesCycle(
  pair: { readonly guarded: string; readonly candidate: string },
  adj: Adjacency,
  guardedSet: ReadonlySet<string>,
): boolean {
  const withoutCandidate = new Set([pair.candidate]);
  const fromGuarded = reachable(pair.guarded, adj, withoutCandidate);
  const fromCandidate = reachable(pair.candidate, adj, guardedSet);
  for (const shared of fromGuarded) {
    const validShared =
      shared !== pair.guarded &&
      shared !== pair.candidate &&
      !guardedSet.has(shared) &&
      fromCandidate.has(shared);
    if (
      validShared &&
      reachable(shared, adj, withoutCandidate).has(pair.guarded) &&
      reachable(shared, adj, guardedSet).has(pair.candidate)
    ) {
      return true;
    }
  }
  return false;
}

function matchingSiblingFor(
  candidate: string,
  adj: Adjacency,
  guardedSet: ReadonlySet<string>,
): string | undefined {
  if (guardedSet.has(candidate)) {
    return undefined;
  }
  const directCalls = adj.get(candidate);
  for (const guarded of guardedSet) {
    if (!directCalls?.has(guarded) && sharesCycle({ guarded, candidate }, adj, guardedSet)) {
      return guarded;
    }
  }
  return undefined;
}

function collectGuardFindings(
  entries: readonly Entry[],
  adj: Adjacency,
  context: {
    readonly guard: string;
    readonly guardedSet: ReadonlySet<string>;
    readonly reported: Set<string>;
    readonly findings: SiblingFinding[];
  },
): void {
  for (const entry of entries) {
    if (context.reported.has(entry.name)) {
      continue;
    }
    const sibling = matchingSiblingFor(entry.name, adj, context.guardedSet);
    if (sibling !== undefined) {
      context.reported.add(entry.name);
      context.findings.push({ entry, sibling, guard: context.guard });
    }
  }
}

export function unguardedSiblingsOf(
  entries: readonly Entry[],
  calls: EntryCalls,
  guards: GuardMap,
): SiblingFinding[] {
  const adj = adjacencyOf(calls);
  const findings: SiblingFinding[] = [];
  const reported = new Set<string>();
  for (const guard of allGuardNamesOf(guards)) {
    const guardedSet = guardedEntriesFor(guard, guards, calls);
    collectGuardFindings(entries, adj, { guard, guardedSet, reported, findings });
  }
  return findings;
}
