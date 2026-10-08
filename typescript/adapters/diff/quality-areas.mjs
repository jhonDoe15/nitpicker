import path from 'node:path';

const runnerPath = path.join(import.meta.dirname, 'quality-areas-runner.mjs');

export function createQualityAreaAnalyzer({
  name,
  kind,
  version,
  configurationHash,
  exclusions,
  timeoutMs,
  dependencies = [],
  adapterArguments = [],
  concurrencyWeight = 1,
  concurrencyGroup,
  executionPriority = 0,
  shardWeight = 1,
}) {
  return {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    dependencies,
    concurrencyWeight,
    concurrencyGroup,
    executionPriority,
    shardWeight,
    requiresDependencies: true,
    createInvocation({
      projectRoot,
      policyRoot,
      projectPolicyRoot,
      toolRoot,
      snapshot,
      baselineRoot,
      liveProjectRoot,
    }) {
      return {
        command: process.execPath,
        args: [
          runnerPath,
          '--analyzer-name',
          name,
          '--kind',
          kind,
          '--project-root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
          '--snapshot',
          snapshot,
          ...(liveProjectRoot === undefined ? [] : ['--live-project-root', liveProjectRoot]),
          ...(projectPolicyRoot === undefined ? [] : ['--project-policy-root', projectPolicyRoot]),
          ...(baselineRoot === undefined ? [] : ['--baseline-root', baselineRoot]),
          ...adapterArguments,
        ],
        cwd: toolRoot,
      };
    },
  };
}
