import { normalizeGitPath } from '../../git/normalize.mts';
import { opaqueClassOf, opaquePartners } from './opaque-token.mts';
import type { TrackedFinding } from '../model/finding-types.mts';

const MIN_SIMILAR_TOKENS = 3;
const MAX_NEIGHBOR_VISITS = 2_000_000;

type Tokenized = TrackedFinding & { readonly tokens: readonly string[] };
type Renames = ReadonlyMap<string, string>;
type Route = [Tokenized, Tokenized][];
type State = {
  readonly index: Map<string, Tokenized[]>;
  readonly owner: Map<Tokenized, Tokenized>;
  readonly visited: Set<Tokenized>;
  overBudget: boolean;
};
type Search = {
  readonly state: State;
  readonly reached: Set<Tokenized>;
  readonly pending: [Tokenized, Route][];
  visits: number;
};

function isTokenized(finding: TrackedFinding): finding is Tokenized {
  return (finding.tokens?.length ?? 0) >= MIN_SIMILAR_TOKENS;
}

function groupKey(finding: TrackedFinding, renames: Renames): string {
  const normalizedPath = normalizeGitPath(finding.path);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    renames.get(normalizedPath) ?? normalizedPath,
    finding.classification,
  ]);
}

function patternOf(tokens: readonly string[], index: number): string {
  return JSON.stringify(tokens.with(index, '\0'));
}

function keysOf(group: string, tokens: readonly string[]): string[] {
  return tokens.flatMap((token, index) => {
    const kind = opaqueClassOf(token);
    return kind === undefined ? [] : [`${group}\0${patternOf(tokens, index)}\0${kind}`];
  });
}

function lookupKeys(group: string, tokens: readonly string[]): string[] {
  return tokens.flatMap((token, index) => {
    const kind = opaqueClassOf(token);
    return (kind === undefined ? [] : opaquePartners(kind)).map(
      (partner) => `${group}\0${patternOf(tokens, index)}\0${partner}`,
    );
  });
}

function addToIndex(index: Map<string, Tokenized[]>, key: string, finding: Tokenized): void {
  index.set(key, [...(index.get(key) ?? []), finding]);
}

function indexBase(
  baseFindings: readonly TrackedFinding[],
  renames: Renames,
): Map<string, Tokenized[]> {
  const index = new Map<string, Tokenized[]>();
  for (const base of baseFindings.filter(isTokenized)) {
    const group = groupKey(base, renames);
    addToIndex(index, `${group}\0${JSON.stringify(base.tokens)}`, base);
    for (const key of keysOf(group, base.tokens)) {
      addToIndex(index, key, base);
    }
  }
  return index;
}

function neighborsOf(head: Tokenized, index: ReadonlyMap<string, Tokenized[]>): Tokenized[] {
  const group = groupKey(head, new Map());
  const keys = [`${group}\0${JSON.stringify(head.tokens)}`, ...lookupKeys(group, head.tokens)];
  return [...new Set(keys.flatMap((key) => index.get(key) ?? []))];
}

function assign(route: Route, state: State): void {
  for (const [base, head] of route) {
    state.owner.set(base, head);
  }
}

function visit(head: Tokenized, route: Route, search: Search): Route | undefined {
  const { state } = search;
  const neighbors = neighborsOf(head, state.index);
  search.visits += neighbors.length;
  state.overBudget ||= search.visits > MAX_NEIGHBOR_VISITS;
  for (const base of neighbors.filter((candidate) => !state.visited.has(candidate))) {
    if (search.reached.has(base)) {
      continue;
    }
    search.reached.add(base);
    const found: Route = [[base, head], ...route];
    const owner = state.owner.get(base);
    if (owner === undefined) {
      return found;
    }
    if (!state.overBudget) {
      search.pending.push([owner, found]);
    }
  }
  return undefined;
}

function augment(start: Tokenized, state: State): boolean {
  const search: Search = { state, reached: new Set(), pending: [[start, []]], visits: 0 };
  for (const [head, route] of search.pending) {
    const found = visit(head, route, search);
    if (found !== undefined) {
      assign(found, state);
      return true;
    }
  }
  for (const base of search.reached) {
    state.visited.add(base);
  }
  return false;
}

function byIdentity(left: TrackedFinding, right: TrackedFinding): number {
  return left.identity.localeCompare(right.identity);
}

export function matchSimilarFindings({
  headFindings,
  baseFindings,
  renames,
}: {
  readonly headFindings: readonly TrackedFinding[];
  readonly baseFindings: readonly TrackedFinding[];
  readonly renames: Renames;
}): {
  readonly matched: TrackedFinding[];
  readonly unmatched: TrackedFinding[];
  readonly matchedBase: Set<TrackedFinding>;
} {
  const state: State = {
    index: indexBase(baseFindings.toSorted(byIdentity), renames),
    owner: new Map<Tokenized, Tokenized>(),
    visited: new Set<Tokenized>(),
    overBudget: false,
  };
  for (const head of headFindings.filter(isTokenized).toSorted(byIdentity)) {
    if (augment(head, state)) {
      state.visited.clear();
    }
  }
  const matched = new Set<TrackedFinding>(state.owner.values());
  return {
    matched: headFindings.filter((head) => matched.has(head)),
    unmatched: headFindings.filter((head) => !matched.has(head)),
    matchedBase: new Set<TrackedFinding>(state.owner.keys()),
  };
}
