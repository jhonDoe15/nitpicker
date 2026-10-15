import { comparisonKey } from './fingerprint.mjs';
import { normalizeGitPath } from './git.mjs';
import { folderMoves, mainDestination } from './renames.mjs';

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames = new Map(),
  baseToHeadDirectories = new Map(),
  touchedCode,
}) {
  const baseByKey = indexFindings({
    findings: baseFindings,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
    snapshot: 'base',
  });
  const comparedHead = againstMissingReports(headFindings, baseFindings);
  const headByKey = indexFindings({ findings: comparedHead, snapshot: 'head' });
  const present = classifyHeadFindings({ headByKey, baseByKey, touchedCode });
  const unmatchedBase = [...baseByKey]
    .filter(([key]) => !headByKey.has(key))
    .map(([, baseFinding]) => baseFinding);
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

const BROKEN_ON_HEAD = 'The base produced this {tool} report, so the change broke it.';
const NOT_COMPARED = 'Not enforced: no base {tool} report shows whether the change added it.';

function reclassified(finding, classification, sentence) {
  return {
    ...Object.fromEntries(Object.entries(finding).filter(([field]) => field !== 'toolNotRun')),
    classification,
    message: `${finding.message} ${sentence.replace('{tool}', finding.tool)}`,
  };
}

function againstMissingReports(headFindings, baseFindings) {
  const missingOnBase = new Set(
    baseFindings.filter((finding) => finding.toolNotRun === true).map((finding) => finding.tool),
  );
  return headFindings.map((finding) => {
    if (finding.toolNotRun === true && !missingOnBase.has(finding.tool)) {
      return reclassified(finding, 'tool-error', BROKEN_ON_HEAD);
    }
    return finding.classification === 'enforceable' && missingOnBase.has(finding.tool)
      ? reclassified(finding, 'descriptive', NOT_COMPARED)
      : finding;
  });
}

function classifyHeadFindings({ headByKey, baseByKey, touchedCode }) {
  const buckets = { newFindings: [], unchangedFindings: [], changedMetrics: [] };
  for (const [key, headFinding] of headByKey) {
    const { bucket, entry } = classify(headFinding, baseByKey.get(key), touchedCode);
    buckets[bucket].push(entry);
  }
  return buckets;
}

function classify(headFinding, baseFinding, touchedCode) {
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
  return movedFiles * 2 > finding.ratchet.value
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
          message: `${finding.message} ${advice.replaceAll('{base}', String(baseValue))}`,
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
    headFinding.ratchet === undefined ||
    isInTouchedCode(headFinding, touchedCode) ||
    isOnAddedLine(headFinding, touchedCode);
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

function isInTouchedCode(finding, touchedCode) {
  if (touchedCode === undefined || finding.classification !== 'enforceable') {
    return false;
  }
  if (!touchedCode.isStrictRule(finding.rule, finding)) {
    return false;
  }
  const changed = touchedCode.changedLines.get(finding.path);
  if (changed === undefined) {
    return false;
  }
  if (changed.added) {
    return true;
  }
  if (
    finding.ratchet?.existingCodeOnly === true &&
    touchedCode.mustMeetOnEditedLines?.(finding.rule) !== true
  ) {
    return false;
  }
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return (
    line !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end)
  );
}

function isOnAddedLine(finding, touchedCode) {
  const line = finding.location?.line;
  const inserted = touchedCode?.changedLines.get(finding.path)?.inserted;
  return (
    finding.ratchet?.existingCodeOnly === true &&
    line !== undefined &&
    (inserted ?? []).some(([start, end]) => start <= line && line <= end)
  );
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
