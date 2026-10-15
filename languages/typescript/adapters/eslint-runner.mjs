import { pathToFileURL } from 'node:url';

import path from 'node:path';

import { parseArguments } from './eslint/arguments.mjs';

import { realpathSync, statSync } from 'node:fs';

import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from './static-checks/dependencies.mjs';

import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';

import {
  linkDependencies,
  installPolicyFiles,
  restorePolicyFiles,
  removeDependencyLinks,
} from './eslint/policy.mjs';

import { validatedContainedFile } from './eslint/paths.mjs';

import { spawnSync } from 'node:child_process';

import { normalizeEslintResults } from './eslint/normalize.mjs';

const MAX_ESLINT_OUTPUT_BYTES = 50 * 1024 * 1024;

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = runEslint(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(
      `ESLint differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

function runEslint(options) {
  const state = {
    linkedDependencies: [],
    installedPolicyFiles: [],
    preparedDependencies: undefined,
  };
  try {
    prepareEslint(options, state);
    const installedConfig = state.installedPolicyFiles.at(0);
    const result = invokeEslint(options, installedConfig?.targetPath);
    return normalizeEslintResults({
      value: readEslintResult(result, options.timeoutMs),
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
    });
  } finally {
    cleanUpEslint(state);
  }
}

function prepareEslint(options, state) {
  const dependencyRoot = realpathSync(path.join(options.liveProjectRoot, 'node_modules'));
  if (!statSync(dependencyRoot).isDirectory()) {
    throw new Error(`Installed ESLint dependencies are missing at ${dependencyRoot}`);
  }
  state.preparedDependencies = prepareSnapshotDependencies(options);
  if (options.policyRoot !== PACKAGE_ROOT) {
    state.linkedDependencies = linkDependencies({ dependencyRoot, roots: [options.policyRoot] });
  }
  state.installedPolicyFiles = installPolicyFiles(options);
}

function invokeEslint(options, installedProjectConfig) {
  const eslintCliPath =
    options.eslintCliPath ?? resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath;
  const wrapperConfigPath = path.join(import.meta.dirname, 'eslint-wrapper.config.mjs');
  const policyConfigPath = validatedContainedFile(
    options.policyRoot,
    options.configRelativePath,
    '--config',
  ).canonicalPath;
  return spawnSync(
    process.execPath,
    [
      eslintCliPath,
      '--config',
      wrapperConfigPath,
      '--format',
      'json',
      '--no-color',
      '--no-error-on-unmatched-pattern',
      ...options.patterns,
    ],
    {
      cwd: options.projectRoot,
      env: {
        ...process.env,
        ...options.environment,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: policyConfigPath,
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: options.projectRoot,
        NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: installedProjectConfig ?? '',
      },
      encoding: 'utf8',
      maxBuffer: MAX_ESLINT_OUTPUT_BYTES,
      timeout: options.timeoutMs,
      killSignal: 'SIGTERM',
    },
  );
}

function readEslintResult(result, timeoutMs) {
  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`ESLint timed out after ${String(timeoutMs)} ms`, { cause: result.error });
    }
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`ESLint exited with ${String(result.status)}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = result.stderr.trim();
    const suffix = detail.length === 0 ? '' : `: ${detail}`;
    throw new Error(`ESLint did not produce valid JSON${suffix}`, { cause: error });
  }
}

function cleanUpEslint(state) {
  try {
    restorePolicyFiles(state.installedPolicyFiles);
  } finally {
    try {
      removeDependencyLinks(state.linkedDependencies);
    } finally {
      removeSnapshotDependencies(state.preparedDependencies);
    }
  }
}
