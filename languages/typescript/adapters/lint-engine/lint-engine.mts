import path from 'node:path';
import { toolBinaryPath } from '../typed/tooling.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import { readHeadPolicy } from '../typed/head-policy.mts';
import {
  LINT_CONFIG,
  TEST_ENVIRONMENTS_VARIABLE,
} from '../../preset/test-environment/resolve-environment.mjs';
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
};

const MAX_ESLINT_OUTPUT_BYTES = 50 * 1024 * 1024;

export async function runLintEngine({
  options,
  projectConfigPath,
  policyConfigPath,
  testEnvironments,
}: LintEngineRun): Promise<unknown> {
  const invocation = eslintInvocation({
    options,
    projectConfigPath,
    policyConfigPath,
    testEnvironments,
  });
  if (lintEngine(options) === 'eslint') return runEslintCli(invocation, options.patterns);
  return lintWithOxlint({
    options,
    environment: invocation.environment,
    projectConfigPath,
    runEslintCli: (patterns, extraEnvironment) =>
      runEslintCli(invocation, patterns, extraEnvironment),
  });
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
      }),
    },
  };
}

async function runEslintCli(
  invocation: EslintInvocation,
  patterns: readonly string[],
  extraEnvironment: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  const { options } = invocation;
  const result = await spawnCollected(
    process.execPath,
    [
      invocation.eslintCliPath,
      '--config',
      path.join(import.meta.dirname, '..', 'eslint-wrapper.config.mjs'),
      '--format',
      'json',
      '--no-color',
      '--no-error-on-unmatched-pattern',
      ...patterns,
    ],
    {
      cwd: options.projectRoot,
      env: { ...invocation.environment, ...extraEnvironment },
      maxBuffer: MAX_ESLINT_OUTPUT_BYTES,
      timeoutMs: options.timeoutMs,
    },
  );
  assertEslintCompleted(result, options);
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
  if (result.status !== 0 && result.status !== 1) {
    const detail = failureDetail(result) || 'no diagnostic output';
    const incompatible = incompatiblePackageMessage(detail, { cwd: projectRoot });
    if (incompatible !== undefined) {
      throw new Error(incompatible);
    }
    throw new Error(describeProcessEnd('ESLint', result));
  }
}
