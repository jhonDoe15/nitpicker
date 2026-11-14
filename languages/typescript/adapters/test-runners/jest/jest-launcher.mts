import { findPackageJson } from '../typed/runner-tools.mts';
import type { TestOptions } from '../typed/runner-types.mts';
import { troubleshootingError } from '../../lint-engine/typed/tools.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../shared/messages/troubleshooting.mjs';

type Launcher = keyof typeof LAUNCHERS;

export type JestLaunch = {
  readonly tool: { readonly relativeToolPath: string } | { readonly absoluteToolPath: string };
  readonly leading: readonly string[];
  readonly trailing: readonly string[];
};

const LAUNCHERS = {
  'react-scripts': { packageName: 'react-scripts', bin: 'bin/react-scripts.js' },
  craco: { packageName: '@craco/craco', bin: 'dist/bin/craco.js' },
};

function missingLauncher(launcher: Launcher, projectRoot: string, cause?: unknown): Error {
  const { packageName } = LAUNCHERS[launcher];
  return troubleshootingError(
    `The test script runs "${launcher} test", but ${packageName} is not installed in ${projectRoot}. ` +
      'Install the project dependencies, or set "tools.tests.runner" in nitpicker.config.json.',
    TROUBLESHOOTING_ANCHORS.testRunnerNotInstalled,
    { cause },
  );
}

function launcherPackageFile(launcher: Launcher, projectRoot: string): string | undefined {
  try {
    return findPackageJson(
      LAUNCHERS[launcher].packageName,
      pathToFileURL(path.join(projectRoot, 'package.json')).href,
    );
  } catch (error) {
    if (fieldOf(error, 'code') === 'ERR_MODULE_NOT_FOUND') {
      throw missingLauncher(launcher, projectRoot, error);
    }
    throw error;
  }
}

function isLauncher(launcher: string): launcher is Launcher {
  return Object.hasOwn(LAUNCHERS, launcher);
}

function launcherBinary(launcher: string, projectRoot: string): string {
  if (!isLauncher(launcher)) {
    throw new Error(`Unknown Jest launcher: ${launcher}`);
  }
  const packageFile = launcherPackageFile(launcher, projectRoot);
  if (packageFile === undefined) {
    throw missingLauncher(launcher, projectRoot);
  }
  const root = realpathSync(path.dirname(packageFile));
  const binPath = path.resolve(root, LAUNCHERS[launcher].bin);
  if (!binPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`The ${launcher} binary must stay inside its package: ${binPath}`);
  }
  if (!existsSync(binPath)) {
    throw missingLauncher(launcher, projectRoot);
  }
  return binPath;
}

export function jestTool(options: TestOptions, launcher: string | undefined): JestLaunch {
  if (launcher === undefined) {
    return { tool: { relativeToolPath: 'jest/bin/jest.js' }, leading: [], trailing: [] };
  }
  return {
    tool: { absoluteToolPath: launcherBinary(launcher, options.liveProjectRoot) },
    leading: ['test'],
    trailing: ['--watchAll=false'],
  };
}
