import { comparisonKey } from './fingerprint.mjs';

/**
 * Splits findings into new, resolved, unchanged and changed-metric. When `touchedCode` is given, an
 * enforceable finding of a strict rule that sits in code this change touched is new even though the
 * base has it: `touchedCode.isStrictRule(rule, finding)` names the strict rules and
 * `touchedCode.changedLines` comes from `readChangedLines`. Findings in untouched code stay
 * baselined.
 */
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
  const headByKey = indexFindings({ findings: headFindings, snapshot: 'head' });
  const present = classifyHeadFindings({ headByKey, baseByKey, touchedCode });
  const unmatchedBase = [...baseByKey]
    .filter(([key]) => !headByKey.has(key))
    .map(([, baseFinding]) => baseFinding);
  const ratcheted = holdRatchetedFindings({
    newFindings: present.newFindings,
    unmatchedBase,
    renames: baseToHeadRenames,
    directories: baseToHeadDirectories,
  });
  present.newFindings = ratcheted.newFindings;
  present.unchangedFindings.push(...ratcheted.heldFindings);
  const resolvedFindings = unmatchedBase.filter((finding) => !ratcheted.matchedBase.has(finding));

  return {
    newFindings: sortFindings(present.newFindings),
    resolvedFindings: sortFindings(resolvedFindings),
    unchangedFindings: sortFindings(present.unchangedFindings),
    changedMetrics: present.changedMetrics.sort(compareDisplayOrder),
  };
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
  const bucket = isInTouchedCode(headFinding, touchedCode) ? 'newFindings' : 'unchangedFindings';
  return { bucket, entry: headFinding };
}

function holdRatchetedFindings({ newFindings, unmatchedBase, renames, directories }) {
  const baseByRatchet = new Map();
  for (const baseFinding of unmatchedBase) {
    if (baseFinding.ratchet !== undefined) {
      baseByRatchet.set(ratchetKey(baseFinding, renames, directories), baseFinding);
    }
  }
  const result = { newFindings: [], heldFindings: [], matchedBase: new Set() };
  for (const headFinding of newFindings) {
    const baseFinding =
      headFinding.ratchet === undefined
        ? undefined
        : baseByRatchet.get(ratchetKey(headFinding, new Map(), new Map()));
    if (baseFinding === undefined || headFinding.ratchet.value > baseFinding.ratchet.value) {
      result.newFindings.push(headFinding);
      continue;
    }
    result.matchedBase.add(baseFinding);
    result.heldFindings.push({ ...headFinding, heldAtBase: baseFinding.ratchet.value });
  }
  return result;
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
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return (
    line !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end)
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
