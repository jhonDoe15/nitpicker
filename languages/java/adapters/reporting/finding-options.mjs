export function javaFindingOptions(policy = {}) {
  return {
    crapLimit: policy.crapLimit,
    preset: policy.preset ?? 'java',
    conventions: policy.conventions,
    fileLimits: policy.fileLimits,
    exclude: policy.exclude,
    exceptions: policy.exceptions,
    testSeconds: policy.testSeconds,
    testConsoleAllow: policy.testConsoleAllow,
    javaStyle: policy.javaStyle,
    baselineRoot: policy.baselineRoot,
    baseline: { snapshot: policy.snapshot, baselineRoot: policy.baselineRoot },
  };
}
