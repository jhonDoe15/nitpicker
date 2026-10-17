import { normalizeGitPath } from '../../git/normalize.mjs';
import { opaqueClassOf, opaquePartners } from './opaque-token.mjs';

const MIN_SIMILAR_TOKENS = 3;
const MAX_NEIGHBOR_VISITS = 2_000_000;

function groupKey(finding, renames) {
  const normalizedPath = normalizeGitPath(finding.path);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    renames.get(normalizedPath) ?? normalizedPath,
    finding.classification,
  ]);
}

function patternOf(tokens, index) {
  return JSON.stringify(tokens.with(index, '\0'));
}

function keysOf(group, tokens) {
  return tokens.flatMap((token, index) => {
    const kind = opaqueClassOf(token);
    return kind === undefined ? [] : [`${group}\0${patternOf(tokens, index)}\0${kind}`];
  });
}

function lookupKeys(group, tokens) {
  return tokens.flatMap((token, index) => {
    const kind = opaqueClassOf(token);
    return (kind === undefined ? [] : opaquePartners(kind)).map(
      (partner) => `${group}\0${patternOf(tokens, index)}\0${partner}`,
    );
  });
}

function addToIndex(index, key, finding) {
  index.set(key, [...(index.get(key) ?? []), finding]);
}

function indexBase(baseFindings, renames) {
  const index = new Map();
  for (const base of baseFindings.filter(({ tokens }) => tokens?.length >= MIN_SIMILAR_TOKENS)) {
    const group = groupKey(base, renames);
    addToIndex(index, `${group}\0${JSON.stringify(base.tokens)}`, base);
    for (const key of keysOf(group, base.tokens)) {
      addToIndex(index, key, base);
    }
  }
  return index;
}

function neighborsOf(head, index) {
  const group = groupKey(head, new Map());
  const keys = [`${group}\0${JSON.stringify(head.tokens)}`, ...lookupKeys(group, head.tokens)];
  return [...new Set(keys.flatMap((key) => index.get(key) ?? []))];
}

function assign(route, state) {
  for (const [base, head] of route) {
    state.owner.set(base, head);
  }
}

function visit(head, route, search) {
  const { state } = search;
  const neighbors = neighborsOf(head, state.index);
  search.visits += neighbors.length;
  state.overBudget ||= search.visits > MAX_NEIGHBOR_VISITS;
  for (const base of neighbors.filter((candidate) => !state.visited.has(candidate))) {
    if (search.reached.has(base)) {
      continue;
    }
    search.reached.add(base);
    const found = [[base, head], ...route];
    if (!state.owner.has(base)) {
      return found;
    }
    if (!state.overBudget) {
      search.pending.push([state.owner.get(base), found]);
    }
  }
  return undefined;
}

function augment(start, state) {
  const search = { state, reached: new Set(), pending: [[start, []]], visits: 0 };
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

function byIdentity(left, right) {
  return left.identity.localeCompare(right.identity);
}

export function matchSimilarFindings({ headFindings, baseFindings, renames }) {
  const state = {
    index: indexBase(baseFindings.toSorted(byIdentity), renames),
    owner: new Map(),
    visited: new Set(),
    overBudget: false,
  };
  for (const head of headFindings
    .filter(({ tokens }) => tokens?.length >= MIN_SIMILAR_TOKENS)
    .toSorted(byIdentity)) {
    if (augment(head, state)) {
      state.visited.clear();
    }
  }
  const matched = new Set(state.owner.values());
  return {
    matched: headFindings.filter((head) => matched.has(head)),
    unmatched: headFindings.filter((head) => !matched.has(head)),
    matchedBase: new Set(state.owner.keys()),
  };
}
