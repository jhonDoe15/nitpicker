import { createHash } from 'node:crypto';

function keyedHash(configurationHash, key) {
  return createHash('sha256').update(`${configurationHash}\0comparison\0${key}`).digest('hex');
}

function keyedAnalyzer(analyzer, key) {
  const { resolveConfigurationHash } = analyzer;
  return {
    ...analyzer,
    configurationHash: keyedHash(analyzer.configurationHash, key),
    ...(resolveConfigurationHash === undefined
      ? {}
      : { resolveConfigurationHash: (root) => keyedHash(resolveConfigurationHash(root), key) }),
  };
}

export function withComparisonKeys(analyzers, comparison) {
  return analyzers.map((analyzer) => {
    const key = analyzer.comparisonKey?.(comparison);
    return key === undefined ? analyzer : keyedAnalyzer(analyzer, key);
  });
}
