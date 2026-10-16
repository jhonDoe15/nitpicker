import { RULE_IDS } from '../../policy.mjs';
import { copyGroups } from './copy-groups.mjs';
import { listPaths, reuseFinding } from './reuse-finding.mjs';
import { createSimilarityCache, tokenSimilarity } from './token-similarity.mjs';

const KINDS = new Set(['function', 'class']);
const MINIMUM_TOKENS = 20;
const MINIMUM_SIMILARITY = 0.8;

function isComparable(definition) {
  return (
    KINDS.has(definition.kind) && definition.tokens.length >= MINIMUM_TOKENS && !definition.entry
  );
}

function memoized(read) {
  const known = new Map();
  return (file) => {
    if (!known.has(file)) {
      known.set(file, read(file));
    }
    return known.get(file);
  };
}

function stateOf({ path, definition }, baselineFile) {
  const baseline = baselineFile(path);
  if (baseline.unchanged) {
    return { state: 'untouched' };
  }
  const before = baseline.definitions.find(
    ({ kind, name }) => kind === definition.kind && name === definition.name,
  );
  if (before === undefined) {
    return { state: 'new' };
  }
  return before.text === definition.text ? { state: 'untouched' } : { state: 'edited', before };
}

function divergesFrom(cache, { copy, before }, other) {
  const right = other.definition.tokens;
  const after = tokenSimilarity(cache, { left: copy.definition.tokens, right }, MINIMUM_SIMILARITY);
  const earlier = tokenSimilarity(cache, { left: before.tokens, right }, MINIMUM_SIMILARITY);
  return after > 0 && earlier > after;
}

function editFinding({ copy, untouched, analyzerName }) {
  const { name, line } = copy.definition;
  return reuseFinding(analyzerName, {
    key: 'siblingCopyEdit',
    path: copy.path,
    identity: `sibling-copy:${name}`,
    symbol: name,
    line,
    values: { name, others: listPaths(untouched.map(({ path }) => path).toSorted()) },
  });
}

function groupFindings({ copies, baselineFile, analyzerName, cache }) {
  const states = copies.map((copy) => ({ copy, ...stateOf(copy, baselineFile) }));
  const untouched = states.filter(({ state }) => state === 'untouched').map(({ copy }) => copy);
  return states
    .filter(({ state }) => state === 'edited')
    .map((edited) => ({
      copy: edited.copy,
      untouched: untouched.filter((other) => divergesFrom(cache, edited, other)),
    }))
    .filter((found) => found.untouched.length > 0)
    .map((found) => editFinding({ ...found, analyzerName }));
}

export function siblingCopyEditFindings(
  modules,
  { analyzerName, isExcepted, baselineFile, acrossPackages = false },
) {
  if (baselineFile === undefined) {
    return [];
  }
  const baselineOf = memoized(baselineFile);
  const cache = createSimilarityCache();
  const grouped = acrossPackages
    ? modules.map((module) => ({ ...module, packageRoot: '' }))
    : modules;
  return copyGroups(grouped, {
    rule: RULE_IDS.siblingCopyEdit,
    isExcepted,
    isComparable,
    keyOf: ({ kind, name }) => `${kind}\0${name}`,
  }).flatMap((copies) => groupFindings({ copies, baselineFile: baselineOf, analyzerName, cache }));
}
