import { alignTrees } from './align/align.mts';
import type { Alignment } from './align/align.mts';
import { canonicalTree } from './canonical/canonical.mts';
import { searchedSets, sortedUnits } from './engine-search.mts';
import { inlinedTrees } from './proof/inline.mts';
import { proveSameLogic } from './proof/prove.mts';
import type { Proof, ProofSide } from './proof/prove.mts';
import { candidatePairs } from './search/candidates.mts';
import { bagOf, createVocabulary, matchMasks } from './search/tokens.mts';
import { THRESHOLDS } from './thresholds/thresholds.mts';
import { KEY_MODES, compareText, createKeyCache, digest, keyOf } from './tree/keys.mts';
import { present, sizeOf } from './tree/nodes.mts';
import type { KeyCache, NearUnit, PreparedUnit, TreeNode } from './tree/tree-types.mts';
import { sharedRun } from './verdict/runs.mts';
import { wholeVerdict } from './verdict/whole.mts';

export type Refutation = {
  readonly units: readonly string[];
  readonly subject: string;
  readonly counterexample: string | undefined;
};

export type NearFinding = {
  readonly verdict: string;
  readonly identity: string;
  readonly templateHash: string;
  readonly units: [string, string];
  readonly template: TreeNode;
  readonly parameters: {
    readonly kind: string;
    readonly deferred: boolean;
    readonly a: TreeNode;
    readonly b: TreeNode;
  }[];
  readonly renames: { readonly a: TreeNode; readonly b: TreeNode }[];
  readonly sharedNodes: number;
  readonly rewritten: boolean;
  readonly run?: { readonly start: number; readonly end: number }[];
  readonly proof?: 'logic' | 'inlined';
};

export type ProveLogic = (sides: readonly [ProofSide, ProofSide]) => Proof | undefined;

export type SkippedPair = { readonly units: readonly string[]; readonly reason: string };

export type ProofOptions = {
  readonly cachedKey?: KeyCache;
  readonly refuted?: Refutation[];
  readonly proveLogic?: ProveLogic;
};

export type SearchOptions = {
  readonly refuted?: Refutation[];
  readonly changed?: Iterable<string>;
  readonly failed?: SkippedPair[];
  readonly proveLogic?: ProveLogic | undefined;
};

type Pair = readonly [PreparedUnit, PreparedUnit];
type Proving = {
  readonly cachedKey: KeyCache;
  readonly refuted: Refutation[];
  readonly proveLogic: ProveLogic;
};
type Tokenizer = (root: TreeNode) => number[];
import { largest, smallest } from '../lists/lists.mts';

export function prepareUnit(
  unit: NearUnit,
  tokensOf: Tokenizer = createVocabulary(),
): PreparedUnit {
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

function oriented([left, right]: Pair, cachedKey: KeyCache): [PreparedUnit, PreparedUnit] {
  const order =
    compareText(cachedKey(left.tree, KEY_MODES.exact), cachedKey(right.tree, KEY_MODES.exact)) ||
    compareText(left.unit.id, right.unit.id);
  return order <= 0 ? [left, right] : [right, left];
}

function spanOf(statements: readonly TreeNode[]): { start: number; end: number } {
  return {
    start: smallest(statements.map(({ start }) => start ?? Number.NaN)),
    end: largest(statements.map(({ end }) => end ?? Number.NaN)),
  };
}

function describe(
  [first, second]: Pair,
  { verdict, alignment, cachedKey }: { verdict: string; alignment: Alignment; cachedKey: KeyCache },
): NearFinding {
  const { state, template } = alignment;
  const templateHash = digest(cachedKey(template, KEY_MODES.exact));
  const ids = [first.unit.id, second.unit.id].sort(compareText);
  return {
    verdict,
    identity: `${present(ids[0])}|${present(ids[1])}|${templateHash}`,
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

function provedLogic(
  [first, second]: Pair,
  { alignment, cachedKey, refuted, proveLogic }: Proving & { alignment: Alignment },
): NearFinding | undefined {
  const proof = proveLogic([
    { unit: first.unit, tree: first.tree },
    { unit: second.unit, tree: second.tree },
  ]);
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

function alignedPair(
  sides: Pair,
  cachedKey: KeyCache,
): { pair: Pair; trees: [TreeNode, TreeNode]; alignment: Alignment } {
  const pair = oriented(sides, cachedKey);
  const trees: [TreeNode, TreeNode] = [pair[0].tree, pair[1].tree];
  return { pair, trees, alignment: alignTrees(trees[0], trees[1], cachedKey) };
}

function provedInlined(
  sides: Pair,
  { cachedKey, refuted, proveLogic }: Proving,
): NearFinding | undefined {
  const { pair, trees, alignment } = alignedPair(sides, cachedKey);
  if (wholeVerdict(trees, alignment.state).verdict === 'same') {
    const finding = describe(pair, { verdict: 'same', alignment, cachedKey });
    return { ...finding, rewritten: true, proof: 'inlined' };
  }
  return provedLogic(pair, { alignment, cachedKey, refuted, proveLogic });
}

export function proveUnits(
  sides: Pair,
  { cachedKey = createKeyCache(), refuted = [], proveLogic = proveSameLogic }: ProofOptions = {},
): NearFinding | undefined {
  const { pair, trees, alignment } = alignedPair(sides, cachedKey);
  const whole = wholeVerdict(trees, alignment.state);
  if (whole.verdict === 'same') {
    return describe(pair, { verdict: whole.verdict, alignment, cachedKey });
  }
  const logic = provedLogic(pair, { alignment, cachedKey, refuted, proveLogic });
  if (logic !== undefined) {
    return logic;
  }
  if (whole.verdict !== undefined) {
    return describe(pair, { verdict: whole.verdict, alignment, cachedKey });
  }
  const run = sharedRun(trees, cachedKey);
  return run === undefined
    ? undefined
    : describe(pair, { verdict: 'partial-run', alignment: run, cachedKey });
}

function largeEnough(unit: PreparedUnit): PreparedUnit | undefined {
  return unit.size >= THRESHOLDS.minRunNodes ? unit : undefined;
}

function preparedSets(
  units: readonly NearUnit[],
  tokensOf: Tokenizer,
): {
  originals: PreparedUnit[];
  mixed: PreparedUnit[];
  variants: Map<string, PreparedUnit>;
} {
  const trees = inlinedTrees(units);
  const sorted = sortedUnits(units);
  const originals = sorted.map((unit) => largeEnough(prepareUnit(unit, tokensOf)));
  const variants = new Map(
    sorted.flatMap((unit): [string, PreparedUnit][] => {
      const tree = trees.get(unit.id);
      const variant =
        tree === undefined ? undefined : largeEnough(prepareUnit({ ...unit, tree }, tokensOf));
      return variant === undefined ? [] : [[unit.id, variant]];
    }),
  );
  const mixed = sorted.map((unit, index) => variants.get(unit.id) ?? originals[index]);
  return {
    originals: originals.filter((unit) => unit !== undefined),
    mixed: mixed.filter((unit) => unit !== undefined),
    variants,
  };
}

function idsOf(pair: Pair): string {
  return pair.map(({ unit }) => unit.id).join('\n');
}

function scopeTest(
  list: readonly PreparedUnit[],
  changed: ReadonlySet<string> | undefined,
): (index: number) => boolean {
  return (index) => changed === undefined || changed.has(present(list[index]).unit.id);
}

function pairsIn(
  list: readonly PreparedUnit[],
  changed: ReadonlySet<string> | undefined,
): [PreparedUnit, PreparedUnit][] {
  const pairs = candidatePairs(list, scopeTest(list, changed));
  return pairs.map(([first, second]) => [present(list[first]), present(list[second])]);
}

function inlinedPair(
  pair: Pair,
  variants: ReadonlyMap<string, PreparedUnit>,
): [PreparedUnit, PreparedUnit] | undefined {
  const [first, second] = pair;
  const sides: [PreparedUnit, PreparedUnit] = [
    variants.get(first.unit.id) ?? first,
    variants.get(second.unit.id) ?? second,
  ];
  return sides[0] !== first || sides[1] !== second ? sides : undefined;
}

function attempted(
  pair: Pair,
  failed: SkippedPair[],
  compare: () => NearFinding | undefined,
): NearFinding | undefined {
  try {
    return compare();
  } catch (error) {
    failed.push({
      units: pair.map(({ unit }) => unit.id),
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function findNearDuplicates(
  units: readonly NearUnit[],
  options: SearchOptions = {},
): NearFinding[] {
  const tokensOf = createVocabulary();
  const proof: Proving = {
    cachedKey: createKeyCache(),
    refuted: options.refuted ?? [],
    proveLogic: options.proveLogic ?? proveSameLogic,
  };
  const changed = options.changed === undefined ? undefined : new Set(options.changed);
  const searched =
    changed === undefined ? searchedSets(sortedUnits(units), inlinedTrees(units)) : undefined;
  const { originals, mixed, variants } = searched ?? preparedSets(units, tokensOf);
  const pairs = searched?.originalPairs ?? pairsIn(originals, changed);
  const seen = new Set(pairs.map(idsOf));
  const failed = options.failed ?? [];
  const found = pairs.map((pair) =>
    attempted(pair, failed, () => {
      const inlined = inlinedPair(pair, variants);
      return (
        proveUnits(pair, proof) ??
        (inlined === undefined ? undefined : provedInlined(inlined, proof))
      );
    }),
  );
  const extra =
    variants.size === 0
      ? []
      : (searched?.mixedPairs ?? pairsIn(mixed, changed))
          .filter(
            (pair) => !seen.has(idsOf(pair)) && pair.some(({ unit }) => variants.has(unit.id)),
          )
          .map((pair) => attempted(pair, failed, () => provedInlined(pair, proof)));
  return [...found, ...extra]
    .filter((finding) => finding !== undefined)
    .sort((left, right) => compareText(left.identity, right.identity));
}
