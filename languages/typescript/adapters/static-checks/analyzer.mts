import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textOf } from '../../../../shared/values/readers.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const runnerPath = checkoutModulePath(
  path.join(fileURLToPath(new URL('../', import.meta.url)), 'static-checks-runner.mjs'),
);

type StaticCheckSettings = {
  readonly name: string;
  readonly kind: string | undefined;
  readonly version?: string | undefined;
  readonly configurationHash?: string | undefined;
  readonly exclusions?: readonly string[] | undefined;
  readonly configRelativePath: string | undefined;
  readonly ignoreRelativePath?: string | undefined;
  readonly patterns?: readonly string[] | undefined;
  readonly includeOnly?: string | undefined;
  readonly exclude?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly timeoutScale?: unknown;
  readonly shardWeight?: number | undefined;
};

type StaticCheckInvocationRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string;
};

type StaticCheckAnalyzer = {
  readonly name: string;
  readonly requiresDependencies: boolean;
  readonly createInvocation: (request: StaticCheckInvocationRequest) => {
    command: string;
    args: (string | undefined)[];
    cwd: string;
  };
  readonly [field: string]: unknown;
};

export function createStaticCheckAnalyzer({
  name,
  kind,
  version,
  configurationHash,
  exclusions,
  configRelativePath,
  ignoreRelativePath,
  patterns = [],
  includeOnly,
  exclude,
  timeoutMs,
  timeoutScale,
  shardWeight = 1,
}: StaticCheckSettings): StaticCheckAnalyzer {
  return {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    ...(timeoutScale === undefined ? {} : { timeoutScale }),
    shardWeight,
    requiresDependencies: kind === 'typecheck',
    createInvocation({ projectRoot, policyRoot, toolRoot, liveProjectRoot }) {
      const args = [
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
        '--config',
        configRelativePath,
        ...optionalArguments({ liveProjectRoot, ignoreRelativePath, includeOnly, exclude }),
        ...patterns.flatMap((pattern) => ['--pattern', pattern]),
      ];
      return {
        command: process.execPath,
        args,
        cwd: toolRoot,
      };
    },
  };
}

function optionalArguments(values: Readonly<Record<string, string | undefined>>): string[] {
  const flags: Readonly<Record<string, string>> = {
    liveProjectRoot: '--live-project-root',
    ignoreRelativePath: '--ignore-path',
    includeOnly: '--include-only',
    exclude: '--exclude',
  };
  return Object.entries(flags).flatMap(([key, flag]) =>
    values[key] === undefined ? [] : [flag, textOf(values[key])],
  );
}
