import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArguments } from './eslint/arguments.mjs';
import { realpathSync, statSync } from 'node:fs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from './static-checks/dependencies.mjs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { runLintEngine } from './lint-engine/lint-engine.mjs';
import {
  linkDependencies,
  installPolicyFiles,
  restorePolicyFiles,
  removeDependencyLinks,
} from './eslint/policy.mjs';
import { validatedContainedFile } from './eslint/paths.mjs';
import { normalizeEslintResults } from './eslint/normalize.mjs';
import {
  testEnvironmentNotices,
  testEnvironmentsFor,
} from '../preset/test-environment/resolve-environment.mjs';
import { typescriptFailureText } from './hints/tool-failure-hint.mjs';

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
    process.stderr.write(`ESLint differential adapter failed: ${typescriptFailureText(error)}\n`);
    process.exitCode = 2;
  }
}

export function runEslint(options) {
  const state = {
    linkedDependencies: [],
    installedPolicyFiles: [],
    preparedDependencies: undefined,
  };
  try {
    const installedPolicyFiles = prepareEslint(options, state);
    const policyConfig = validatedContainedFile(
      options.policyRoot,
      options.configRelativePath,
      '--config',
    );
    const testEnvironments = testEnvironmentsFor(options);
    const value = runLintEngine({
      options,
      projectConfigPath: installedPolicyFiles.at(0)?.targetPath,
      policyConfigPath: policyConfig.canonicalPath,
      testEnvironments,
    });
    return [
      ...normalizeEslintResults({
        value,
        projectRoot: options.projectRoot,
        analyzerName: options.analyzerName,
      }),
      ...testEnvironmentNotices({ testEnvironments, analyzerName: options.analyzerName }),
    ];
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
  const installedPolicyFiles = installPolicyFiles(options);
  state.installedPolicyFiles = installedPolicyFiles;
  return installedPolicyFiles;
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
