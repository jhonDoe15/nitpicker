import { findPackageJSON } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mjs';

const LAUNCHERS = {
  'react-scripts': { packageName: 'react-scripts', bin: 'bin/react-scripts.js' },
  craco: { packageName: '@craco/craco', bin: 'dist/bin/craco.js' },
};

function missingLauncher(launcher, projectRoot, cause) {
  const { packageName } = LAUNCHERS[launcher];
  return troubleshootingError(
    `The test script runs "${launcher} test", but ${packageName} is not installed in ${projectRoot}. ` +
      'Install the project dependencies, or set "tools.tests.runner" in nitpicker.config.json.',
    TROUBLESHOOTING_ANCHORS.testRunnerNotInstalled,
    { cause },
  );
}

function launcherPackageFile(launcher, projectRoot) {
  try {
    return findPackageJSON(
      LAUNCHERS[launcher].packageName,
      pathToFileURL(path.join(projectRoot, 'package.json')).href,
    );
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      throw missingLauncher(launcher, projectRoot, error);
    }
    throw error;
  }
}

function launcherBinary(launcher, projectRoot) {
  if (!Object.hasOwn(LAUNCHERS, launcher)) {
    throw new Error(`Unknown Jest launcher: ${String(launcher)}`);
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

export function jestTool(options, launcher) {
  if (launcher === undefined) {
    return { tool: { relativeToolPath: 'jest/bin/jest.js' }, leading: [], trailing: [] };
  }
  return {
    tool: { absoluteToolPath: launcherBinary(launcher, options.liveProjectRoot) },
    leading: ['test'],
    trailing: ['--watchAll=false'],
  };
}
