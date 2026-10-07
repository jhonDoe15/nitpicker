import { comparisonKey } from './fingerprint.mjs';

export function compareFindings({ baseFindings, headFindings, baseToHeadRenames = new Map() }) {
  const baseByKey = indexFindings(baseFindings, baseToHeadRenames, 'base');
  const headByKey = indexFindings(headFindings, new Map(), 'head');
  const newFindings = [];
  const resolvedFindings = [];
  const unchangedFindings = [];
  const changedMetrics = [];

  for (const [key, headFinding] of headByKey) {
    const baseFinding = baseByKey.get(key);
    if (baseFinding === undefined) {
      newFindings.push(headFinding);
      continue;
    }

    if (hasChangedMetric(baseFinding, headFinding)) {
      changedMetrics.push({
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
      });
    } else {
      unchangedFindings.push(headFinding);
    }
  }

  for (const [key, baseFinding] of baseByKey) {
    if (!headByKey.has(key)) {
      resolvedFindings.push(baseFinding);
    }
  }

  return {
    newFindings: sortFindings(newFindings),
    resolvedFindings: sortFindings(resolvedFindings),
    unchangedFindings: sortFindings(unchangedFindings),
    changedMetrics: changedMetrics.sort(compareDisplayOrder),
  };
}

function indexFindings(findings, renames, snapshot) {
  const indexed = new Map();
  for (const finding of findings) {
    const key = comparisonKey(finding, renames);
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
