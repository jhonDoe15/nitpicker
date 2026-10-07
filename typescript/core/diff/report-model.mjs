import { createHash } from 'node:crypto';

export function analyzerName(analyzer, index) {
  return typeof analyzer === 'object' &&
    analyzer !== null &&
    typeof analyzer.name === 'string' &&
    analyzer.name.length > 0
    ? analyzer.name
    : `unknown-analyzer-${String(index)}`;
}

export function policyHash(analyzers) {
  const policy = analyzers.map((analyzer, index) => ({
    name: analyzerName(analyzer, index),
    version: analyzerMetadata(analyzer, 'version'),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
    exclusions:
      typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
        ? analyzer.exclusions
        : [],
  }));
  return createHash('sha256').update(JSON.stringify(policy)).digest('hex');
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
