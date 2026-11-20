import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutationScopeArguments } from '../../../../core/tooling/runner-arguments.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const runnerPath = checkoutModulePath(
  path.join(fileURLToPath(new URL('../', import.meta.url)), 'quality-areas-runner.mjs'),
);

type TimeoutScale = {
  readonly perThousandFilesMs: number;
  readonly extensions: readonly string[];
};

type QualityAreaAnalyzerSettings = {
  readonly name: string;
  readonly kind: string | undefined;
  readonly version?: string | undefined;
  readonly configurationHash?: string | undefined;
  readonly exclusions?: readonly string[] | undefined;
  readonly timeoutMs?: number | undefined;
  readonly timeoutScale?: TimeoutScale | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly adapterArguments?: readonly string[] | undefined;
  readonly concurrencyWeight?: number | undefined;
  readonly concurrencyGroup?: string | undefined;
  readonly executionPriority?: number | undefined;
  readonly reportedTools?: readonly string[] | undefined;
  readonly shardWeight?: number | undefined;
  readonly publishesModuleImports?: true | undefined;
};

type OptionalRoots = {
  readonly liveProjectRoot?: string | undefined;
  readonly projectPolicyRoot?: string | undefined;
  readonly baselineRoot?: string | undefined;
  readonly baselineMovesFile?: string | undefined;
  readonly mutationScope?: readonly string[] | undefined;
};

type QualityAreaInvocationRequest = OptionalRoots & {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly snapshot: string;
};

type QualityAreaAnalyzer = {
  readonly name: string;
  readonly createInvocation: (request: QualityAreaInvocationRequest) => {
    command: string;
    args: (string | undefined)[];
    cwd: string;
  };
  readonly [field: string]: unknown;
};

export function createQualityAreaAnalyzer({
  name,
  kind,
  version,
  configurationHash,
  exclusions,
  timeoutMs,
  timeoutScale,
  dependencies = [],
  adapterArguments = [],
  concurrencyWeight = 1,
  concurrencyGroup,
  executionPriority = 0,
  reportedTools = [],
  shardWeight = 1,
  publishesModuleImports,
}: QualityAreaAnalyzerSettings): QualityAreaAnalyzer {
  return {
    name,
    publishesModuleImports: publishesModuleImports ?? false,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    ...(timeoutScale === undefined ? {} : { timeoutScale }),
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
}: OptionalRoots): string[] {
  return [
    ...(liveProjectRoot === undefined ? [] : ['--live-project-root', liveProjectRoot]),
    ...(projectPolicyRoot === undefined ? [] : ['--project-policy-root', projectPolicyRoot]),
    ...(baselineRoot === undefined ? [] : ['--baseline-root', baselineRoot]),
    ...(baselineMovesFile === undefined ? [] : ['--baseline-moves-file', baselineMovesFile]),
    ...mutationScopeArguments(mutationScope),
  ];
}
