import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutationScopeArguments } from '../../../../core/tooling/runner-arguments.mjs';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const runnerPath = checkoutModulePath(
  path.join(fileURLToPath(new URL('../', import.meta.url)), 'quality-areas-runner.mjs'),
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
  publishesModuleImports = false,
}) {
  return {
    name,
    publishesModuleImports,
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
        ...optionalRootArguments({
          ...optionalRoots,
          mutationScope: kind === 'mutation' ? optionalRoots.mutationScope : undefined,
        }),
        ...adapterArguments,
      ];
      return { command: process.execPath, args, cwd: toolRoot };
    },
  };
}

function optionalRootArguments({
  liveProjectRoot,
  projectPolicyRoot,
  baselineRoot,
  baselineMovesFile,
  mutationScope,
}) {
  return [
    ...(liveProjectRoot === undefined ? [] : ['--live-project-root', liveProjectRoot]),
    ...(projectPolicyRoot === undefined ? [] : ['--project-policy-root', projectPolicyRoot]),
    ...(baselineRoot === undefined ? [] : ['--baseline-root', baselineRoot]),
    ...(baselineMovesFile === undefined ? [] : ['--baseline-moves-file', baselineMovesFile]),
    ...mutationScopeArguments(mutationScope),
  ];
}
