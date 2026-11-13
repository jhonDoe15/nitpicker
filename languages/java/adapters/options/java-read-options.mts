import type { JavaPolicy } from '../typed/java-values.mts';

export function readOptions(policy: JavaPolicy = {}): Readonly<Record<string, unknown>> {
  return {
    crapLimit: policy.crapLimit,
    quick: policy.quick,
    preset: policy.preset ?? 'java',
    conventions: policy.conventions,
    fileLimits: policy.fileLimits,
    exclude: policy.exclude,
    exceptions: policy.exceptions,
    layout: policy.layout,
    testSeconds: policy.testSeconds,
    testConsoleAllow: policy.testConsoleAllow,
    javaStyle: policy.javaStyle,
    featureLayout: policy.layout,
    baselineRoot: policy.baselineRoot,
    baselineMovesFile: policy.baselineMovesFile,
    baseline: { snapshot: policy.snapshot, baselineRoot: policy.baselineRoot },
  };
}
