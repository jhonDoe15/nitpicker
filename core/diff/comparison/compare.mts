import { changedByDiff } from './base-red/unknown-base.mts';
import { baseMoves, comparisonKey } from './fingerprint.mts';
import { againstMissingReports } from './notices/missing-reports.mts';
import { matchSimilarFindings } from './similar/match.mts';
import { matchAnchoredFindings } from './anchored/match.mts';
import { matchMovedMessages } from './moved-names/moved-messages.mts';
import { addGrowthAdvice, holdRatchetedFindings } from './ratchet/ratchet.mts';
import { isHeldOnTouchedLine } from './ratchet/touched-code.mts';
import { pairedKeys } from './positions/occurrences.mts';
import { withEditedLineReason } from './positions/touched-lines.mts';
import { withCauseExplained, withoutCausesIn, worseMessageOf } from './model/advice-views.mts';
import type { Metric, TrackedFinding } from './model/finding-types.mts';
import type {
  AnchorRequest,
  ChangedMetric,
  Classified,
  ClassifyContext,
  ClassifyRequest,
  CompareRequest,
  Compared,
  IndexFindingsRequest,
  IndexRequest,
  MoveContext,
  Present,
  SettleRequest,
} from './model/compare-types.mts';
import { isRatcheted } from './model/finding-guards.mts';

export type { CompareRequest };

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames = new Map<string, string>(),
  touchedCode,
  unknownOnBase,
  ...layoutMoves
}: CompareRequest): Compared {
  const moves = baseMoves(baseToHeadRenames, { ...layoutMoves, headFindings });
  const { baseByKey, headByKey } = indexSnapshots({
    baseFindings,
    headFindings,
    moves,
    touchedCode,
  });
  const present = classifyHeadFindings({ headByKey, baseByKey, touchedCode, unknownOnBase });
  const withoutExactMatch = [...baseByKey]
    .filter(([key]) => !headByKey.has(key))
    .map(([, baseFinding]) => baseFinding);
  const anchored = moveAnchoredFindings(present, {
    baseFindings: moveSimilarFindings(present, withoutExactMatch, { moves, touchedCode }),
    snapshots: { base: baseFindings, head: headFindings },
    renames: moves.files,
    touchedCode,
  });
  const { unmatchedBase } = anchored;
  const ratcheted = holdRatchetedFindings({
    newFindings: present.newFindings,
    unmatchedBase,
    moves,
    touchedCode,
  });
  const advised = [
    ...addGrowthAdvice({ findings: ratcheted.newFindings, baseFindings, moves }),
    ...anchored.grown,
  ];
  const explained = withCauseExplained(advised, touchedCode);
  present.newFindings = againstMissingReports(explained, baseFindings, moves);
  present.unchangedFindings = present.unchangedFindings.concat(ratcheted.heldFindings);
  const resolvedFindings = unmatchedBase.filter((finding) => !ratcheted.matchedBase.has(finding));

  return withoutCausesIn({
    newFindings: sortFindings(present.newFindings),
    resolvedFindings: sortFindings(resolvedFindings),
    unchangedFindings: sortFindings(present.unchangedFindings),
    changedMetrics: sortFindings(present.changedMetrics),
  });
}

function indexSnapshots({ baseFindings, headFindings, moves, touchedCode }: IndexRequest) {
  const keys = pairedKeys({ baseFindings, headFindings, moves, touchedCode });
  return {
    baseByKey: indexFindings({ findings: baseFindings, moves, snapshot: 'base' }),
    headByKey: indexFindings({ findings: headFindings, snapshot: 'head', keys }),
  };
}

function moveSimilarFindings(
  present: Present,
  baseFindings: readonly TrackedFinding[],
  { moves, touchedCode }: MoveContext,
) {
  const similar = matchSimilarFindings({
    headFindings: present.newFindings,
    baseFindings,
    renames: moves.files,
  });
  present.newFindings = similar.unmatched;
  present.unchangedFindings = present.unchangedFindings.concat(similar.matched);
  const unmatched = baseFindings.filter((finding) => !similar.matchedBase.has(finding));
  return moveMessageFindings(present, unmatched, { moves, touchedCode });
}

function moveAnchoredFindings(
  present: Present,
  { baseFindings, snapshots, renames, touchedCode }: AnchorRequest,
) {
  const pairs = matchAnchoredFindings({
    headFindings: present.newFindings.filter((finding) => present.withoutBase.has(finding)),
    baseFindings,
    snapshots,
    renames,
    touchedCode,
  });
  return settled(present, { pairs, baseFindings, touchedCode });
}

function moveMessageFindings(
  present: Present,
  baseFindings: readonly TrackedFinding[],
  { moves, touchedCode }: MoveContext,
) {
  const pairs = matchMovedMessages({
    headFindings: present.newFindings.filter(
      (finding) => present.withoutBase.has(finding) && finding.ratchet === undefined,
    ),
    baseFindings,
    moves,
  });
  return settled(present, { pairs, baseFindings, touchedCode }).unmatchedBase;
}

function settled(present: Present, { pairs, baseFindings, touchedCode }: SettleRequest) {
  const movedHeads = new Set(pairs.map(({ head }) => head));
  present.newFindings = present.newFindings.filter((finding) => !movedHeads.has(finding));
  const grown: TrackedFinding[] = [];
  for (const { head, base } of pairs) {
    if (isRatcheted(head) && isRatcheted(base) && head.ratchet.value > base.ratchet.value) {
      grown.push(worseMessageOf(head, base.ratchet.value));
      continue;
    }
    place(present, classify(head, base, { touchedCode, isUnknown: false }), base);
  }
  const movedBase = new Set(pairs.map(({ base }) => base));
  return { unmatchedBase: baseFindings.filter((finding) => !movedBase.has(finding)), grown };
}

function heldAt(
  bucket: 'newFindings' | 'unchangedFindings',
  entry: TrackedFinding,
  base: TrackedFinding,
): TrackedFinding {
  return bucket === 'unchangedFindings' && entry.ratchet !== undefined && base.ratchet !== undefined
    ? { ...entry, heldAtBase: base.ratchet.value }
    : entry;
}

function place(present: Present, { bucket, entry }: Classified, base?: TrackedFinding): void {
  if (bucket === 'changedMetrics') {
    present.changedMetrics.push(entry);
  } else {
    present[bucket].push(base === undefined ? entry : heldAt(bucket, entry, base));
  }
}

function classifyHeadFindings({
  headByKey,
  baseByKey,
  touchedCode,
  unknownOnBase,
}: ClassifyRequest): Present {
  const buckets: Present = {
    newFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
    withoutBase: new Set(),
  };
  for (const [key, headFinding] of headByKey) {
    if (!baseByKey.has(key)) {
      buckets.withoutBase.add(headFinding);
    }
    const classified = classify(headFinding, baseByKey.get(key), {
      touchedCode,
      isUnknown: unknownOnBase?.(headFinding) === true,
    });
    place(buckets, classified);
  }
  return buckets;
}

function classify(
  headFinding: TrackedFinding,
  baseFinding: TrackedFinding | undefined,
  { touchedCode, isUnknown }: ClassifyContext,
): Classified {
  if (baseFinding === undefined) {
    const bucket =
      isUnknown && !changedByDiff(headFinding, touchedCode) ? 'unchangedFindings' : 'newFindings';
    return { bucket, entry: headFinding };
  }
  const metrics = changedMetricsOf(baseFinding, headFinding);
  if (metrics !== undefined) {
    return { bucket: 'changedMetrics', entry: changedMetricOf(headFinding, metrics) };
  }
  return isHeldOnTouchedLine(headFinding, touchedCode)
    ? { bucket: 'newFindings', entry: withEditedLineReason(headFinding, touchedCode) }
    : { bucket: 'unchangedFindings', entry: headFinding };
}

function changedMetricOf(
  headFinding: TrackedFinding,
  { base, head }: { readonly base: Metric; readonly head: Metric },
): ChangedMetric {
  return {
    tool: headFinding.tool,
    rule: headFinding.rule,
    path: headFinding.path,
    symbol: headFinding.symbol,
    identity: headFinding.identity,
    message: headFinding.message,
    metric: head.name,
    baseValue: base.value,
    headValue: head.value,
    delta: head.value - base.value,
  };
}

function indexFindings({ findings, moves, snapshot, keys = new Map() }: IndexFindingsRequest) {
  const indexed = new Map<string, TrackedFinding>();
  for (const finding of findings) {
    const key = keys.get(finding) ?? comparisonKey(finding, moves);
    if (indexed.has(key)) {
      throw new Error(
        `${snapshot} analyzer output contains duplicate stable identity for ${finding.tool}/${finding.rule} at ${finding.path}`,
      );
    }
    indexed.set(key, finding);
  }
  return indexed;
}

function changedMetricsOf(
  baseFinding: TrackedFinding,
  headFinding: TrackedFinding,
): { readonly base: Metric; readonly head: Metric } | undefined {
  const base = baseFinding.metric;
  const head = headFinding.metric;
  return baseFinding.classification === 'descriptive' &&
    headFinding.classification === 'descriptive' &&
    base !== undefined &&
    head !== undefined &&
    base.name === head.name &&
    base.value !== head.value
    ? { base, head }
    : undefined;
}

function sortFindings<T extends Pick<TrackedFinding, 'tool' | 'path' | 'rule' | 'identity'>>(
  findings: readonly T[],
): T[] {
  return findings.toSorted(compareDisplayOrder);
}

function compareDisplayOrder(
  left: Pick<TrackedFinding, 'tool' | 'path' | 'rule' | 'identity'>,
  right: Pick<TrackedFinding, 'tool' | 'path' | 'rule' | 'identity'>,
): number {
  return (
    left.tool.localeCompare(right.tool) ||
    left.path.localeCompare(right.path) ||
    left.rule.localeCompare(right.rule) ||
    left.identity.localeCompare(right.identity)
  );
}
