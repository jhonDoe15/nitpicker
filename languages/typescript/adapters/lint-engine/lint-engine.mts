import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { toolBinaryPath } from '../typed/tooling.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import { readHeadPolicy } from '../typed/head-policy.mts';
import {
  LINT_CONFIG,
  TEST_ENVIRONMENTS_VARIABLE,
} from '../../preset/test-environment/resolve-environment.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../shared/messages/troubleshooting.mjs';
import { incompatiblePackageMessage } from './compatibility/incompatible-package.mts';
import { PROJECT_LAYER_VARIABLE } from './project-layer.mjs';
import type { TestEnvironments } from '../eslint/typed/engine.mts';
import { type LintEngineOptions, projectLayerValue, troubleshootingError } from './typed/tools.mts';
import { type CollectedRun, spawnCollected } from '../oxlint/oxlint-process.mts';
import { lintWithOxlint } from '../oxlint/oxlint-runner.mts';
import {
  describeProcessEnd,
  failureDetail,
} from '../../../../shared/processes/process-failure.mjs';
import { nativeConfigFlags } from './compatibility/native-config.mts';
import {
  MAX_SKIPPED_FILES,
  type RuleCrash,
  nextRuleCrash,
  skippedFileArguments,
} from './crashes/rule-crashes.mts';
import { appendAll } from '../../../../shared/lists/items.mjs';
import { isOutOfMemory, outOfMemoryMessage, withEslintHeap } from './memory/eslint-heap.mts';

export type LintEngineRun = {
  readonly options: LintEngineOptions;
  readonly projectConfigPath?: string | undefined;
  readonly policyConfigPath: string;
  readonly testEnvironments?: TestEnvironments | undefined;
};

type EslintInvocation = {
  readonly options: LintEngineOptions;
  readonly projectConfigPath: string | undefined;
  readonly eslintCliPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly crashes: RuleCrash[];
};

export type LintEngineResult = {
  readonly results: unknown;
  readonly crashes: readonly RuleCrash[];
};

const MAX_ESLINT_OUTPUT_BYTES = 50 * 1024 * 1024;

export async function runLintEngine({
  options,
  projectConfigPath,
  policyConfigPath,
  testEnvironments,
}: LintEngineRun): Promise<LintEngineResult> {
  const invocation = eslintInvocation({
    options,
    projectConfigPath,
    policyConfigPath,
    testEnvironments,
  });
  const results =
    lintEngine(options) === 'eslint'
      ? await runEslintCli(invocation, options.patterns)
      : await lintWithOxlint({
          options,
          environment: invocation.environment,
          projectConfigPath,
          runEslintCli: (patterns, extraEnvironment) =>
            runEslintCli(invocation, patterns, extraEnvironment),
        });
  return { results, crashes: invocation.crashes };
}

function lintEngine(options: LintEngineOptions): string {
  return options.eslintCliPath === undefined
    ? (readHeadPolicy().tools.eslint?.engine ?? 'oxlint')
    : 'eslint';
}

function eslintInvocation({
  options,
  projectConfigPath,
  policyConfigPath,
  testEnvironments,
}: LintEngineRun): EslintInvocation {
  return {
    options,
    projectConfigPath,
    eslintCliPath: options.eslintCliPath ?? toolBinaryPath('eslint', { bin: 'bin/eslint.js' }),
    crashes: [],
    environment: {
      ...process.env,
      ...options.environment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: policyConfigPath,
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: options.projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath ?? '',
      [PROJECT_LAYER_VARIABLE]: projectLayerValue(readHeadPolicy().tools.eslint, {
        liveProjectRoot: options.liveProjectRoot,
        addsRules: options.configRelativePath === LINT_CONFIG,
      }),
      [TEST_ENVIRONMENTS_VARIABLE]: JSON.stringify({
        environment: testEnvironments?.environment,
        scopes: testEnvironments?.scopes ?? [],
        aliases: testEnvironments?.aliases ?? [],
        setupFiles: testEnvironments?.setupFiles ?? [],
        globalDom: testEnvironments?.globalDom,
      }),
    },
  };
}

type EslintSpawn = {
  readonly patterns: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly skipped: readonly RuleCrash[];
};

async function spawnEslint(
  invocation: EslintInvocation,
  { patterns, environment, skipped }: EslintSpawn,
): Promise<CollectedRun> {
  const { options } = invocation;
  const config = fileURLToPath(
    checkoutModuleUrl(new URL('../eslint-wrapper.config.mjs', import.meta.url)),
  );
  return spawnCollected(
    process.execPath,
    [
      invocation.eslintCliPath,
      ...nativeConfigFlags(config).flatMap((flag) => ['--flag', flag]),
      '--config',
      config,
      '--format',
      'json',
      '--no-color',
      '--no-error-on-unmatched-pattern',
      ...skippedFileArguments(skipped),
      ...patterns,
    ],
    {
      cwd: options.projectRoot,
      env: environment,
      maxBuffer: MAX_ESLINT_OUTPUT_BYTES,
      timeoutMs: options.timeoutMs,
    },
  );
}

async function runEslintCli(
  invocation: EslintInvocation,
  patterns: readonly string[],
  extraEnvironment: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  const { options } = invocation;
  const environment = withEslintHeap({ ...invocation.environment, ...extraEnvironment });
  const skipped: RuleCrash[] = [];
  const attempts = Array.from({ length: MAX_SKIPPED_FILES + 1 }, () => skipped);
  for (const attempt of attempts) {
    const result = await spawnEslint(invocation, { patterns, environment, skipped: attempt });
    const crash = nextRuleCrash(result, options.projectRoot, attempt);
    if (crash === undefined) {
      assertEslintCompleted(result, options, environment['NODE_OPTIONS']);
      appendAll(invocation.crashes, attempt);
      return parsedResults(result);
    }
    attempt.push(crash);
  }
  throw new Error('ESLint crashed on more files than nitpicker skips');
}

function parsedResults(result: CollectedRun): unknown {
  try {
    return parseJson(result.stdout);
  } catch (error) {
    const detail = result.stderr.trim();
    const suffix = detail.length === 0 ? '' : `: ${detail}`;
    throw new Error(`ESLint did not produce valid JSON${suffix}`, {
      cause: error,
    });
  }
}

function assertEslintCompleted(
  result: CollectedRun,
  { timeoutMs, projectRoot }: Pick<LintEngineOptions, 'timeoutMs' | 'projectRoot'>,
  nodeOptions: string | undefined,
): void {
  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      throw troubleshootingError(
        `ESLint timed out after ${String(timeoutMs)} ms`,
        TROUBLESHOOTING_ANCHORS.analyzerTimeout,
        { cause: result.error },
      );
    }
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1 && isOutOfMemory(result.stderr)) {
    throw new Error(outOfMemoryMessage(nodeOptions));
  }
  if (result.status !== 0 && result.status !== 1) {
    const detail = failureDetail(result) || 'no diagnostic output';
    const incompatible = incompatiblePackageMessage(detail, { cwd: projectRoot });
    if (incompatible !== undefined) {
      throw new Error(incompatible);
    }
    throw new Error(describeProcessEnd('ESLint', result));
  }
}
