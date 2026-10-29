import { changedByDiff } from './base-red/unknown-base.mjs';
import { comparisonKey } from './fingerprint.mjs';
import { matchSimilarFindings } from './similar/match.mjs';
import { normalizeGitPath } from '../git/normalize.mjs';
import { folderMoves, mainDestination } from '../git/patches/renames.mjs';
import { insertBeforeRoute } from '../../../shared/messages/exception-sentence.mjs';
import { pairedKeys } from './positions/occurrences.mjs';
import { isHeldOnTouchedLine, withEditedLineReason } from './positions/touched-lines.mjs';

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames = new Map(),
  baseToHeadDirectories = new Map(),
  touchedCode,
  unknownOnBase,
}) {
  const { baseByKey, headByKey } = indexSnapshots({
    baseFindings,
    headFindings,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
    touchedCode,
  });
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
  const unmatchedBase = withoutExactMatch.filter((finding) => !similar.matchedBase.has(finding));
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

function indexSnapshots({ baseFindings, headFindings, renames, directories, touchedCode }) {
  const keys = pairedKeys({ baseFindings, headFindings, renames, directories, touchedCode });
  return {
    baseByKey: indexFindings({ findings: baseFindings, renames, directories, snapshot: 'base' }),
    headByKey: indexFindings({ findings: headFindings, snapshot: 'head', keys }),
  };
}

function classifyHeadFindings({ headByKey, baseByKey, touchedCode, unknownOnBase }) {
  const buckets = { newFindings: [], unchangedFindings: [], changedMetrics: [] };
  for (const [key, headFinding] of headByKey) {
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
  return isHeldOnTouchedLine(headFinding, touchedCode)
    ? { bucket: 'newFindings', entry: withEditedLineReason(headFinding, touchedCode) }
    : { bucket: 'unchangedFindings', entry: headFinding };
}

function holdRatchetedFindings({ newFindings, unmatchedBase, renames, directories, touchedCode }) {
  const atSamePath = holdAgainst(
    newFindings,
    groupBaseByRatchetKey(unmatchedBase, (finding) => ratchetKey(finding, renames, directories)),
    { touchedCode, matchedBase: new Set() },
  );
  const moves = folderMoves(renames);
  const movedFolders = groupBaseByRatchetKey(
    unmatchedBase.filter(
      (baseFinding) =>
        baseFinding.ratchet?.pathIsFolder === true && !atSamePath.matchedBase.has(baseFinding),
    ),
    (finding) => movedFolderKey(finding, moves),
  );
  const atMovedPath = holdAgainst(atSamePath.unmatched, movedFolders, {
    touchedCode,
    matchedBase: atSamePath.matchedBase,
  });
  return {
    newFindings: [...atSamePath.grew, ...atMovedPath.grew, ...atMovedPath.unmatched],
    heldFindings: [...atSamePath.heldFindings, ...atMovedPath.heldFindings],
    matchedBase: atMovedPath.matchedBase,
  };
}

function holdAgainst(headFindings, baseByRatchet, { touchedCode, matchedBase }) {
  const result = { unmatched: [], grew: [], heldFindings: [], matchedBase };
  for (const headFinding of headFindings) {
    const candidates = holdCandidatesFor(headFinding, baseByRatchet, touchedCode);
    const baseFinding =
      candidates === undefined || candidates.length === 0
        ? undefined
        : closestCandidate(candidates, headFinding.ratchet.value);
    if (baseFinding === undefined) {
      result.unmatched.push(headFinding);
      continue;
    }
    if (headFinding.ratchet.value > baseFinding.ratchet.value) {
      result.grew.push(grewFinding(headFinding, baseFinding.ratchet.value));
      continue;
    }
    candidates.splice(candidates.indexOf(baseFinding), 1);
    result.matchedBase.add(baseFinding);
    result.heldFindings.push({ ...headFinding, heldAtBase: baseFinding.ratchet.value });
  }
  return result;
}

function movedFolderKey(finding, moves) {
  const destinations = moves.get(normalizeGitPath(finding.path));
  const destination = mainDestination(destinations);
  const movedFiles = destination === undefined ? 0 : destinations.get(destination);
  return movedFiles * 2 > (finding.ratchet.folderFiles ?? finding.ratchet.value)
    ? ratchetKey({ ...finding, path: destination }, new Map(), new Map())
    : undefined;
}

function closestCandidate(candidates, value) {
  const holding = candidates.filter((candidate) => candidate.ratchet.value >= value);
  const pool = holding.length > 0 ? holding : candidates;
  const pick = holding.length > 0 ? Math.min : Math.max;
  const target = pick(...pool.map((candidate) => candidate.ratchet.value));
  return pool.find((candidate) => candidate.ratchet.value === target);
}

function withGrowthAdvice({ findings, baseFindings, renames, directories }) {
  const baseValues = new Map(
    baseFindings
      .filter((baseFinding) => baseFinding.ratchet !== undefined)
      .map((baseFinding) => [
        ratchetKey(baseFinding, renames, directories),
        baseFinding.ratchet.value,
      ]),
  );
  return findings.map((finding) => {
    const advice = finding.ratchet?.growthAdvice;
    const baseValue =
      advice === undefined ? undefined : baseValues.get(ratchetKey(finding, new Map(), new Map()));
    return baseValue === undefined
      ? finding
      : {
          ...finding,
          message: insertBeforeRoute(
            finding.message,
            advice.replaceAll('{base}', String(baseValue)),
          ),
        };
  });
}

function groupBaseByRatchetKey(unmatchedBase, keyOf) {
  const baseByRatchet = new Map();
  const keyed = unmatchedBase
    .filter((baseFinding) => baseFinding.ratchet !== undefined)
    .map((baseFinding) => [keyOf(baseFinding), baseFinding])
    .filter(([key]) => key !== undefined);
  for (const [key, baseFinding] of keyed) {
    baseByRatchet.set(key, [...(baseByRatchet.get(key) ?? []), baseFinding]);
  }
  return baseByRatchet;
}

function holdCandidatesFor(headFinding, baseByRatchet, touchedCode) {
  const isNeverHeld =
    headFinding.ratchet === undefined || isHeldOnTouchedLine(headFinding, touchedCode);
  return isNeverHeld ? undefined : baseByRatchet.get(ratchetKey(headFinding, new Map(), new Map()));
}

function grewFinding(headFinding, baseValue) {
  const { worseMessage } = headFinding.ratchet;
  return worseMessage === undefined
    ? headFinding
    : { ...headFinding, message: worseMessage.replaceAll('{base}', String(baseValue)) };
}

function ratchetKey(finding, renames, directories) {
  return comparisonKey({ ...finding, identity: finding.ratchet.key }, renames, directories);
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

function indexFindings({
  findings,
  renames = new Map(),
  directories = new Map(),
  snapshot,
  keys = new Map(),
}) {
  const indexed = new Map();
  for (const finding of findings) {
    const key = keys.get(finding) ?? comparisonKey(finding, renames, directories);
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
