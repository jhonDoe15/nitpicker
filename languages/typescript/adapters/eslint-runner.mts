import path from 'node:path';
import { type EslintOptions, parseArguments } from './eslint/arguments.mts';
import { realpathSync, statSync } from 'node:fs';
import {
  isInvokedModule,
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
  writeAdapterFindings,
} from './typed/static-checks.mts';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import {
  linkDependencies,
  installPolicyFiles,
  restorePolicyFiles,
  removeDependencyLinks,
  type DependencyLink,
} from './eslint/policy.mts';
import type { LinkedPolicyFile } from './typed/tooling.mts';
import { validatedContainedFile } from './eslint/paths.mts';
import { normalizeEslintResults } from './eslint/normalize.mts';
import {
  type EslintFinding,
  runLintEngine,
  testEnvironmentNotices,
  testEnvironmentsFor,
} from './eslint/typed/engine.mts';

type EslintState = {
  linkedDependencies: DependencyLink[];
  installedPolicyFiles: LinkedPolicyFile[];
  preparedDependencies: unknown;
};

if (isInvokedModule(import.meta.url)) {
  process.exitCode = await writeAdapterFindings(
    'ESLint differential adapter failed',
    () => runEslint(parseArguments(process.argv.slice(2), process.env)),
    process,
  );
}

export async function runEslint(options: EslintOptions): Promise<EslintFinding[]> {
  const state: EslintState = {
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
    const value = await runLintEngine({
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

function prepareEslint(options: EslintOptions, state: EslintState): LinkedPolicyFile[] {
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

function cleanUpEslint(state: EslintState): void {
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
