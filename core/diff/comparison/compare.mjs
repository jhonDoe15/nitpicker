import { changedByDiff } from './base-red/unknown-base.mjs';
import { comparisonKey } from './fingerprint.mjs';
import { matchSimilarFindings } from './similar/match.mjs';
import { matchAnchoredFindings } from './anchored/match.mjs';
import { holdRatchetedFindings, withGrowthAdvice } from './ratchet/ratchet.mjs';
import { isInTouchedCode, isOnAddedLine } from './ratchet/touched-code.mjs';

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames = new Map(),
  baseToHeadDirectories = new Map(),
  touchedCode,
  unknownOnBase,
}) {
  const baseByKey = indexFindings({
    findings: baseFindings,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
    snapshot: 'base',
  });
  const headByKey = indexFindings({ findings: headFindings, snapshot: 'head' });
  const present = classifyHeadFindings({ headByKey, baseByKey, touchedCode, unknownOnBase });
  const withoutExactMatch = [...baseByKey]
    .filter(([key]) => !headByKey.has(key))
    .map(([, baseFinding]) => baseFinding);
  const similar = matchSimilarFindings({
    headFindings: present.newFindings,
    baseFindings: withoutExactMatch,
    renames: baseToHeadRenames,
  });
  present.newFindings = similar.unmatched;
  present.unchangedFindings.push(...similar.matched);
  const unmatchedBase = moveAnchoredFindings(present, {
    baseFindings: withoutExactMatch.filter((finding) => !similar.matchedBase.has(finding)),
    renames: baseToHeadRenames,
    touchedCode,
  });
  const ratcheted = holdRatchetedFindings({
    newFindings: present.newFindings,
    unmatchedBase,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
    touchedCode,
  });
  present.newFindings = withGrowthAdvice({
    findings: ratcheted.newFindings,
    baseFindings,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
  });
  present.unchangedFindings.push(...ratcheted.heldFindings);
  const resolvedFindings = unmatchedBase.filter((finding) => !ratcheted.matchedBase.has(finding));

  return {
    newFindings: sortFindings(present.newFindings),
    resolvedFindings: sortFindings(resolvedFindings),
    unchangedFindings: sortFindings(present.unchangedFindings),
    changedMetrics: present.changedMetrics.sort(compareDisplayOrder),
  };
}

function moveAnchoredFindings(present, { baseFindings, renames, touchedCode }) {
  const pairs = matchAnchoredFindings({
    headFindings: present.newFindings.filter((finding) => present.withoutBase.has(finding)),
    baseFindings,
    renames,
    touchedCode,
  });
  const movedHeads = new Set(pairs.map(({ head }) => head));
  present.newFindings = present.newFindings.filter((finding) => !movedHeads.has(finding));
  for (const { head, base } of pairs) {
    const { bucket, entry } = classify(head, base, { touchedCode, isUnknown: false });
    present[bucket].push(entry);
  }
  const movedBase = new Set(pairs.map(({ base }) => base));
  return baseFindings.filter((finding) => !movedBase.has(finding));
}

function classifyHeadFindings({ headByKey, baseByKey, touchedCode, unknownOnBase }) {
  const buckets = {
    newFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
    withoutBase: new Set(),
  };
  for (const [key, headFinding] of headByKey) {
    if (!baseByKey.has(key)) {
      buckets.withoutBase.add(headFinding);
    }
    const { bucket, entry } = classify(headFinding, baseByKey.get(key), {
      touchedCode,
      isUnknown: unknownOnBase?.(headFinding) === true,
    });
    buckets[bucket].push(entry);
  }
  return buckets;
}

function classify(headFinding, baseFinding, { touchedCode, isUnknown }) {
  if (baseFinding === undefined && isUnknown) {
    const bucket = changedByDiff(headFinding, touchedCode) ? 'newFindings' : 'unchangedFindings';
    return { bucket, entry: headFinding };
  }
  if (baseFinding === undefined) {
    return { bucket: 'newFindings', entry: headFinding };
  }
  if (hasChangedMetric(baseFinding, headFinding)) {
    return { bucket: 'changedMetrics', entry: changedMetricOf(baseFinding, headFinding) };
  }
  const isNew =
    isInTouchedCode(headFinding, touchedCode) || isOnAddedLine(headFinding, touchedCode);
  return { bucket: isNew ? 'newFindings' : 'unchangedFindings', entry: headFinding };
}

function changedMetricOf(baseFinding, headFinding) {
  return {
    tool: headFinding.tool,
    rule: headFinding.rule,
    path: headFinding.path,
    symbol: headFinding.symbol,
    identity: headFinding.identity,
    message: headFinding.message,
    metric: headFinding.metric.name,
    baseValue: baseFinding.metric.value,
    headValue: headFinding.metric.value,
    delta: headFinding.metric.value - baseFinding.metric.value,
  };
}

function indexFindings({ findings, renames = new Map(), directories = new Map(), snapshot }) {
  const indexed = new Map();
  for (const finding of findings) {
    const key = comparisonKey(finding, renames, directories);
    if (indexed.has(key)) {
      throw new Error(
        `${snapshot} analyzer output contains duplicate stable identity for ${finding.tool}/${finding.rule} at ${finding.path}`,
      );
    }
    indexed.set(key, finding);
  }
  return indexed;
}

function hasChangedMetric(baseFinding, headFinding) {
  return (
    baseFinding.classification === 'descriptive' &&
    headFinding.classification === 'descriptive' &&
    baseFinding.metric !== undefined &&
    headFinding.metric !== undefined &&
    baseFinding.metric.name === headFinding.metric.name &&
    baseFinding.metric.value !== headFinding.metric.value
  );
}

function sortFindings(findings) {
  return findings.sort(compareDisplayOrder);
}

function compareDisplayOrder(left, right) {
  return (
    left.tool.localeCompare(right.tool) ||
    left.path.localeCompare(right.path) ||
    left.rule.localeCompare(right.rule) ||
    left.identity.localeCompare(right.identity)
  );
}
