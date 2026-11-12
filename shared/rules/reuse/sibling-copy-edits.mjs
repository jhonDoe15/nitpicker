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

function comparedTokens(definition) {
  return definition.untypedTokens ?? definition.tokens;
}

function tagOf({ text }) {
  return text.slice(0, text.indexOf('|'));
}

function sameUntypedCode(before, definition) {
  const [left, right] = [before.untypedTokens, definition.untypedTokens];
  return (
    left !== undefined &&
    tagOf(before) === tagOf(definition) &&
    right !== undefined &&
    left.length === right.length &&
    left.every((token, index) => token === right[index])
  );
}

function sameDeclaration(left, right) {
  return left.name === right.name && left.qualifier === right.qualifier;
}

function stateOf({ path, definition }, baselineFile) {
  const baseline = baselineFile(path);
  if (baseline.unchanged) {
    return { state: 'untouched' };
  }
  const before = baseline.definitions.find(
    (candidate) => candidate.kind === definition.kind && sameDeclaration(candidate, definition),
  );
  if (before === undefined) {
    return { state: 'new' };
  }
  return before.text === definition.text || sameUntypedCode(before, definition)
    ? { state: 'untouched' }
    : { state: 'edited', before };
}

function divergesFrom(cache, { copy, before }, other) {
  const right = comparedTokens(other.definition);
  const left = comparedTokens(copy.definition);
  const after = tokenSimilarity(cache, { left, right }, MINIMUM_SIMILARITY);
  const earlier = comparedTokens(before);
  return after > 0 && tokenSimilarity(cache, { left: earlier, right }, MINIMUM_SIMILARITY) > after;
}

function editFinding({ copy, untouched, analyzerName }) {
  const { name, qualifier = name, line } = copy.definition;
  return reuseFinding(analyzerName, {
    key: 'siblingCopyEdit',
    path: copy.path,
    identity: `sibling-copy:${qualifier}`,
    symbol: name,
    line,
    values: { name: qualifier, others: listPaths(untouched.map(({ path }) => path).toSorted()) },
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
