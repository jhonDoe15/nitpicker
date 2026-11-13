import { alignTrees } from './align/align.mjs';
import { canonicalTree } from './canonical/canonical.mjs';
import { candidatePairs } from './search/candidates.mjs';
import { bagOf, createVocabulary, matchMasks } from './search/tokens.mjs';
import { THRESHOLDS } from './thresholds.mjs';
import { KEY_MODES, compareText, createKeyCache, digest, keyOf } from './tree/keys.mjs';
import { sizeOf } from './tree/nodes.mjs';
import { sharedRun } from './verdict/runs.mjs';
import { wholeVerdict } from './verdict/whole.mjs';

export function prepareUnit(unit, tokensOf = createVocabulary()) {
  const { tree, original, rewritten } = canonicalTree(unit.tree);
  const tokens = tokensOf(tree);
  return {
    unit,
    tree,
    rewritten,
    plainKey: digest(keyOf(rewritten ? original : tree, KEY_MODES.abstract)),
    size: sizeOf(tree),
    tokens,
    bag: bagOf(tokens),
    masks: matchMasks(tokens),
  };
}

function oriented([left, right], cachedKey) {
  const order =
    compareText(cachedKey(left.tree, KEY_MODES.exact), cachedKey(right.tree, KEY_MODES.exact)) ||
    compareText(left.unit.id, right.unit.id);
  return order <= 0 ? [left, right] : [right, left];
}

function spanOf(statements) {
  return {
    start: Math.min(...statements.map(({ start }) => start)),
    end: Math.max(...statements.map(({ end }) => end)),
  };
}

function describe([first, second], { verdict, alignment, cachedKey }) {
  const { state, template } = alignment;
  const templateHash = digest(cachedKey(template, KEY_MODES.exact));
  const ids = [first.unit.id, second.unit.id].sort(compareText);
  return {
    verdict,
    identity: `${ids[0]}|${ids[1]}|${templateHash}`,
    templateHash,
    units: [first.unit.id, second.unit.id],
    template,
    parameters: state.holes.map(({ kind, deferred, a, b }) => ({ kind, deferred, a, b })),
    renames: state.renames.map(({ a, b }) => ({ a, b })),
    sharedNodes: state.shared,
    rewritten: (first.rewritten || second.rewritten) && first.plainKey !== second.plainKey,
    ...(alignment.statements === undefined ? {} : { run: alignment.statements.map(spanOf) }),
  };
}

export function proveUnits(left, right, cachedKey = createKeyCache()) {
  const pair = oriented([left, right], cachedKey);
  const trees = pair.map((side) => side.tree);
  const alignment = alignTrees(...trees, cachedKey);
  const whole = wholeVerdict(trees, alignment.state);
  if (whole.verdict !== undefined) {
    return describe(pair, { verdict: whole.verdict, alignment, cachedKey });
  }
  const run = sharedRun(trees, cachedKey);
  return run === undefined
    ? undefined
    : describe(pair, { verdict: 'partial-run', alignment: run, cachedKey });
}

export function findNearDuplicates(units, options = {}) {
  const tokensOf = createVocabulary();
  const cachedKey = createKeyCache();
  const prepared = units
    .toSorted((left, right) => compareText(left.id, right.id))
    .map((unit) => prepareUnit(unit, tokensOf))
    .filter((unit) => unit.size >= THRESHOLDS.minRunNodes);
  const changed = options.changed === undefined ? undefined : new Set(options.changed);
  return candidatePairs(
    prepared,
    (index) => changed === undefined || changed.has(prepared[index].unit.id),
  )
    .map(([left, right]) => proveUnits(prepared[left], prepared[right], cachedKey))
    .filter((finding) => finding !== undefined)
    .sort((left, right) => compareText(left.identity, right.identity));
}
