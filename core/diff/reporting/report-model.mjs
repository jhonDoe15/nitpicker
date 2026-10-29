import { createHash } from 'node:crypto';

export function analyzerName(analyzer, index) {
  return typeof analyzer === 'object' &&
    analyzer !== null &&
    typeof analyzer.name === 'string' &&
    analyzer.name.length > 0
    ? analyzer.name
    : `unknown-analyzer-${String(index)}`;
}

export function policyHash(analyzers, configOverrides = []) {
  const policy = analyzers.map((analyzer, index) => ({
    name: analyzerName(analyzer, index),
    version: analyzerMetadata(analyzer, 'version'),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
    exclusions:
      typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
        ? analyzer.exclusions
        : [],
  }));
  const hashed = configOverrides.length === 0 ? policy : { policy, configOverrides };
  return createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
}

export function summaryFields(configOverrides, shardSummary) {
  return {
    configOverrides,
    policyChanges: shardSummary.policyChanges ?? [],
    policyLoosenings: shardSummary.policyLoosenings ?? [],
    ...(shardSummary.policyDigest === undefined ? {} : { policyDigest: shardSummary.policyDigest }),
    policyChangeAccepted: shardSummary.policyChangeAccepted === true,
    ...(shardSummary.policyAcceptanceSource === undefined
      ? {}
      : { policyAcceptanceSource: shardSummary.policyAcceptanceSource }),
    notices: shardSummary.notices ?? [],
  };
}

export function sortByToolAndPath(entries) {
  return entries.sort(
    (left, right) =>
      left.tool.localeCompare(right.tool) ||
      (left.path ?? '').localeCompare(right.path ?? '') ||
      (left.rule ?? '').localeCompare(right.rule ?? '') ||
      (left.identity ?? '').localeCompare(right.identity ?? ''),
  );
}

export function analyzerMetadata(analyzer, property) {
  return typeof analyzer === 'object' && analyzer !== null && typeof analyzer[property] === 'string'
    ? analyzer[property]
    : 'unknown';
}

export function heldFindingsOf(report) {
  return report.unchangedFindings.filter((finding) => finding.heldAtBase !== undefined);
}
