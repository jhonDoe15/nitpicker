import { comparisonKey } from './fingerprint.mjs';
import {
  holdRatchetedFindings,
  isInTouchedCode,
  isOnAddedLine,
  ratchetKey,
} from './ratchet/hold-ratchets.mjs';

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
