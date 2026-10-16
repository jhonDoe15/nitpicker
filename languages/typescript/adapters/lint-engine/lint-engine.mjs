import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { readHeadPolicy } from '../../preset/head-policy.mjs';
import { TEST_ENVIRONMENTS_VARIABLE } from '../../preset/test-environment/resolve-environment.mjs';
import { lintWithOxlint } from '../oxlint/oxlint-runner.mjs';

const MAX_ESLINT_OUTPUT_BYTES = 50 * 1024 * 1024;

export function runLintEngine({ options, projectConfigPath, policyConfigPath, testEnvironments }) {
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

function lintEngine(options) {
  return options.eslintCliPath === undefined
    ? (readHeadPolicy().tools.eslint?.engine ?? 'oxlint')
    : 'eslint';
}

function eslintInvocation({ options, projectConfigPath, policyConfigPath, testEnvironments }) {
  return {
    options,
    projectConfigPath,
    eslintCliPath: options.eslintCliPath ?? resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath,
    environment: {
      ...process.env,
      ...options.environment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: policyConfigPath,
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: options.projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath ?? '',
      [TEST_ENVIRONMENTS_VARIABLE]: JSON.stringify({
        environment: testEnvironments?.environment,
        scopes: testEnvironments?.scopes ?? [],
        aliases: testEnvironments?.aliases ?? [],
        setupFiles: testEnvironments?.setupFiles ?? [],
      }),
    },
  };
}

function runEslintCli(invocation, patterns, extraEnvironment = {}) {
  const { options } = invocation;
  const result = spawnSync(
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
      encoding: 'utf8',
      maxBuffer: MAX_ESLINT_OUTPUT_BYTES,
      timeout: options.timeoutMs,
      killSignal: 'SIGTERM',
    },
  );
  assertEslintCompleted(result, options.timeoutMs);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = result.stderr.trim();
    const suffix = detail.length === 0 ? '' : `: ${detail}`;
    throw new Error(`ESLint did not produce valid JSON${suffix}`, {
      cause: error,
    });
  }
}

function assertEslintCompleted(result, timeoutMs) {
  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`ESLint timed out after ${String(timeoutMs)} ms`, {
        cause: result.error,
      });
    }
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`ESLint exited with ${String(result.status)}: ${detail}`);
  }
}
