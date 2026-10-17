import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerPath = path.join(
  fileURLToPath(new URL('../', import.meta.url)),
  'quality-areas-runner.mjs',
);

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
  reportedTools = [],
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
    reportedTools,
    shardWeight,
    requiresDependencies: true,
    createInvocation({ projectRoot, policyRoot, toolRoot, snapshot, ...optionalRoots }) {
      const args = [
        runnerPath,
        ...['--analyzer-name', name, '--kind', kind],
        ...['--project-root', projectRoot, '--policy-root', policyRoot],
        ...['--tool-root', toolRoot, '--snapshot', snapshot],
        ...optionalRootArguments(optionalRoots),
        ...adapterArguments,
      ];
      return { command: process.execPath, args, cwd: toolRoot };
    },
  };
}

function optionalRootArguments({ liveProjectRoot, projectPolicyRoot, baselineRoot }) {
  return [
    ...(liveProjectRoot === undefined ? [] : ['--live-project-root', liveProjectRoot]),
    ...(projectPolicyRoot === undefined ? [] : ['--project-policy-root', projectPolicyRoot]),
    ...(baselineRoot === undefined ? [] : ['--baseline-root', baselineRoot]),
  ];
}
