import { alignTrees } from './align/align.mjs';
import { canonicalTree } from './canonical/canonical.mjs';
import { inlinedTrees } from './proof/inline.mjs';
import { proveSameLogic } from './proof/prove.mjs';
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

function provedLogic([first, second], { alignment, cachedKey, refuted }) {
  const proof = proveSameLogic([first, second].map(({ unit, tree }) => ({ unit, tree })));
  if (proof === undefined) {
    return undefined;
  }
  if (!proof.proved) {
    const units = [first.unit.id, second.unit.id];
    refuted.push({ units, subject: proof.subject, counterexample: proof.counterexample });
    return undefined;
  }
  const finding = describe([first, second], { verdict: 'same', alignment, cachedKey });
  return { ...finding, parameters: [], renames: [], rewritten: true, proof: 'logic' };
}

function provedInlined(sides, { cachedKey, refuted }) {
  const pair = oriented(sides, cachedKey);
  const trees = pair.map((side) => side.tree);
  const alignment = alignTrees(...trees, cachedKey);
  if (wholeVerdict(trees, alignment.state).verdict === 'same') {
    const finding = describe(pair, { verdict: 'same', alignment, cachedKey });
    return { ...finding, rewritten: true, proof: 'inlined' };
  }
  return provedLogic(pair, { alignment, cachedKey, refuted });
}

export function proveUnits(sides, { cachedKey = createKeyCache(), refuted = [] } = {}) {
  const pair = oriented(sides, cachedKey);
  const trees = pair.map((side) => side.tree);
  const alignment = alignTrees(...trees, cachedKey);
  const whole = wholeVerdict(trees, alignment.state);
  if (whole.verdict === 'same') {
    return describe(pair, { verdict: whole.verdict, alignment, cachedKey });
  }
  const logic = provedLogic(pair, { alignment, cachedKey, refuted });
  if (logic !== undefined || whole.verdict !== undefined) {
    return logic ?? describe(pair, { verdict: whole.verdict, alignment, cachedKey });
  }
  const run = sharedRun(trees, cachedKey);
  return run === undefined
    ? undefined
    : describe(pair, { verdict: 'partial-run', alignment: run, cachedKey });
}

function largeEnough(unit) {
  return unit.size >= THRESHOLDS.minRunNodes ? unit : undefined;
}

function preparedSets(units, tokensOf) {
  const trees = inlinedTrees(units);
  const sorted = units.toSorted((left, right) => compareText(left.id, right.id));
  const originals = sorted.map((unit) => largeEnough(prepareUnit(unit, tokensOf)));
  const variants = new Map(
    sorted
      .filter((unit) => trees.has(unit.id))
      .map((unit) => [
        unit.id,
        largeEnough(prepareUnit({ ...unit, tree: trees.get(unit.id) }, tokensOf)),
      ])
      .filter(([, variant]) => variant !== undefined),
  );
  const mixed = sorted.map((unit, index) => variants.get(unit.id) ?? originals[index]);
  return {
    originals: originals.filter((unit) => unit !== undefined),
    mixed: mixed.filter((unit) => unit !== undefined),
    variants,
  };
}

function idsOf(pair) {
  return pair.map(({ unit }) => unit.id).join('\n');
}

function scopeTest(list, changed) {
  return (index) => changed === undefined || changed.has(list[index].unit.id);
}

function pairsIn(list, changed) {
  return candidatePairs(list, scopeTest(list, changed)).map((pair) =>
    pair.map((index) => list[index]),
  );
}

function inlinedPair(pair, variants) {
  const sides = pair.map((side) => variants.get(side.unit.id) ?? side);
  return sides.some((side, index) => side !== pair[index]) ? sides : undefined;
}

export function findNearDuplicates(units, options = {}) {
  const tokensOf = createVocabulary();
  const proof = { cachedKey: createKeyCache(), refuted: options.refuted ?? [] };
  const changed = options.changed === undefined ? undefined : new Set(options.changed);
  const { originals, mixed, variants } = preparedSets(units, tokensOf);
  const pairs = pairsIn(originals, changed);
  const seen = new Set(pairs.map(idsOf));
  const found = pairs.map((pair) => {
    const inlined = inlinedPair(pair, variants);
    return (
      proveUnits(pair, proof) ?? (inlined === undefined ? undefined : provedInlined(inlined, proof))
    );
  });
  const extra =
    variants.size === 0
      ? []
      : pairsIn(mixed, changed)
          .filter(
            (pair) => !seen.has(idsOf(pair)) && pair.some(({ unit }) => variants.has(unit.id)),
          )
          .map((pair) => provedInlined(pair, proof));
  return [...found, ...extra]
    .filter((finding) => finding !== undefined)
    .sort((left, right) => compareText(left.identity, right.identity));
}
