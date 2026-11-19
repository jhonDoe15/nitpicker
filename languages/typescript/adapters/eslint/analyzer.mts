import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const runnerPath = checkoutModulePath(
  path.join(fileURLToPath(new URL('../', import.meta.url)), 'eslint-runner.mjs'),
);

type EslintAnalyzerSettings = {
  readonly name: string;
  readonly version?: string | undefined;
  readonly configurationHash?: string | undefined;
  readonly exclusions?: readonly string[] | undefined;
  readonly configRelativePath: string;
  readonly patterns: readonly string[];
  readonly policyFiles?: readonly string[] | undefined;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
  readonly timeoutMs?: number | undefined;
  readonly shardWeight?: number | undefined;
  readonly policyFromPackage?: true | undefined;
  readonly colocatedWith?: string | undefined;
  readonly eslintTimeoutMs?: number | undefined;
  readonly eslintCliPath?: string | undefined;
};

type EslintInvocationRoots = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string | undefined;
};

type EslintInvocation = { command: string; args: string[]; cwd: string };

type OptionalArgumentSettings = {
  readonly liveProjectRoot: string | undefined;
  readonly eslintTimeoutMs?: number | undefined;
  readonly eslintCliPath?: string | undefined;
};

function invocationOf(
  settings: EslintAnalyzerSettings,
  roots: EslintInvocationRoots,
): EslintInvocation {
  const { name, configRelativePath, patterns, policyFiles = [], environment = {} } = settings;
  const { projectRoot, policyRoot, toolRoot, liveProjectRoot } = roots;
  const args = [
    runnerPath,
    '--analyzer-name',
    name,
    '--project-root',
    projectRoot,
    '--policy-root',
    policyRoot,
    '--tool-root',
    toolRoot,
    '--config',
    configRelativePath,
    ...optionalArguments({ ...settings, liveProjectRoot }),
    ...environmentArguments(environment),
    ...patterns.flatMap((pattern) => ['--pattern', pattern]),
    ...policyFiles.flatMap((policyFile) => ['--policy-file', policyFile]),
  ];
  return { command: process.execPath, args, cwd: toolRoot };
}

export function createEslintAnalyzer(settings: EslintAnalyzerSettings): {
  readonly name: string;
  readonly requiresDependencies: boolean;
  readonly concurrencyGroup?: string;
  readonly createInvocation: (roots: EslintInvocationRoots) => EslintInvocation;
  readonly [field: string]: unknown;
} {
  const {
    patterns,
    exclusions,
    shardWeight = 1,
    policyFromPackage = false,
    colocatedWith,
  } = settings;
  return {
    name: settings.name,
    version: settings.version,
    configurationHash: settings.configurationHash,
    exclusions,
    lintedGlobs: { include: patterns, exclude: exclusions },
    timeoutMs: settings.timeoutMs,
    shardWeight,
    ...(colocatedWith === undefined ? {} : { colocatedWith }),
    requiresDependencies: true,
    ...(policyFromPackage ? {} : { concurrencyGroup: 'eslint-snapshot-dependencies' }),
    createInvocation(roots) {
      return invocationOf(settings, roots);
    },
  };
}

function optionalArguments({
  liveProjectRoot,
  eslintTimeoutMs,
  eslintCliPath,
}: OptionalArgumentSettings): string[] {
  const args: string[] = [];
  if (liveProjectRoot !== undefined) {
    args.push('--live-project-root', liveProjectRoot);
  }
  if (eslintTimeoutMs !== undefined) {
    args.push('--timeout-ms', String(eslintTimeoutMs));
  }
  if (eslintCliPath !== undefined) {
    args.push('--eslint-cli', eslintCliPath);
  }
  return args;
}

function environmentArguments(environment: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(environment).flatMap(([environmentName, value]) => [
    '--environment',
    `${environmentName}=${String(value)}`,
  ]);
}
