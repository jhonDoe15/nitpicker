import { analyzerMetadata } from '../report-model.mjs';

export function toolSummary({
  analyzer,
  name,
  baseRun,
  headRun,
  baseFindings,
  headFindings,
  result,
}) {
  const baseElapsedMs = baseRun.timings.get(name);
  const headElapsedMs = headRun.timings.get(name);
  const skippedBecause = headRun.skipped?.get(name) ?? baseRun.skipped?.get(name);
  return {
    name,
    ...(skippedBecause === undefined ? {} : { skippedBecause }),
    version: analyzerMetadata(analyzer, 'version'),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
    base: baseFindings.length,
    head: headFindings.length,
    new: result.newFindings.length,
    resolved: result.resolvedFindings.length,
    unchanged: result.unchangedFindings.length,
    changedMetrics: result.changedMetrics.length,
    baseElapsedMs,
    headElapsedMs,
    elapsedMs: (baseElapsedMs ?? 0) + (headElapsedMs ?? 0),
  };
}

export function declaredExclusions(analyzers) {
  return [
    ...new Set(
      analyzers.flatMap((analyzer) =>
        typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
          ? analyzer.exclusions.filter((exclusion) => typeof exclusion === 'string')
          : [],
      ),
    ),
  ].sort();
}
