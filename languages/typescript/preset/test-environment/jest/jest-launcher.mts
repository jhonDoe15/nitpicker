import { findPackageJSON as untypedFindPackageJSON } from '../../../../../core/tooling/package-lookup/package-json.mts';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { withoutOptions } from '../../test-runner/script-command.mts';
import { JEST_OPTIONS_NITPICKER_SETS } from '../../test-runner/runners.mts';

type LauncherEntry = { readonly packageName: string; readonly bin: string };

type JestTool = {
  readonly tool: { readonly relativeToolPath?: string; readonly absoluteToolPath?: string };
  readonly leading: string[];
  readonly trailing: string[];
};

const lookupPackageJSON: unknown = untypedFindPackageJSON;

function findPackageJSON(specifier: string, base: string): string | undefined {
  if (typeof lookupPackageJSON !== 'function') {
    throw new TypeError('findPackageJSON is not a function');
  }
  const found: unknown = Reflect.apply(lookupPackageJSON, undefined, [specifier, base]);
  return typeof found === 'string' ? found : undefined;
}

const LAUNCHERS: Readonly<Record<string, LauncherEntry>> = {
  'react-scripts': { packageName: 'react-scripts', bin: 'bin/react-scripts.js' },
  craco: { packageName: '@craco/craco', bin: 'dist/bin/craco.js' },
  'react-app-rewired': { packageName: 'react-app-rewired', bin: 'bin/index.js' },
  rescripts: { packageName: '@rescripts/cli', bin: 'bin/rescripts.js' },
};

function launcherEntry(launcher: string): LauncherEntry {
  const entry = LAUNCHERS[launcher];
  if (entry === undefined) {
    throw new Error(`Unknown Jest launcher: ${launcher}`);
  }
  return entry;
}

function missingLauncher(launcher: string, projectRoot: string, cause?: unknown): Error {
  const { packageName } = launcherEntry(launcher);
  return troubleshootingError(
    `The test script runs "${launcher} test", but ${packageName} is not installed in ${projectRoot}. ` +
      'Install the project dependencies, or set "tools.tests.runner" in nitpicker.config.json.',
    TROUBLESHOOTING_ANCHORS.testRunnerNotInstalled,
    { cause },
  );
}

function launcherPackageFile(launcher: string, projectRoot: string): string | undefined {
  try {
    return findPackageJSON(
      launcherEntry(launcher).packageName,
      pathToFileURL(path.join(projectRoot, 'package.json')).href,
    );
  } catch (error) {
    if (fieldOf(error, 'code') === 'ERR_MODULE_NOT_FOUND') {
      throw missingLauncher(launcher, projectRoot, error);
    }
    throw error;
  }
}

function launcherBinary(launcher: string, projectRoot: string): string {
  if (!Object.hasOwn(LAUNCHERS, launcher)) {
    throw new Error(`Unknown Jest launcher: ${launcher}`);
  }
  const packageFile = launcherPackageFile(launcher, projectRoot);
  if (packageFile === undefined) {
    throw missingLauncher(launcher, projectRoot);
  }
  const root = realpathSync(path.dirname(packageFile));
  const binPath = path.resolve(root, launcherEntry(launcher).bin);
  if (!binPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`The ${launcher} binary must stay inside its package: ${binPath}`);
  }
  if (!existsSync(binPath)) {
    throw missingLauncher(launcher, projectRoot);
  }
  return binPath;
}

export function jestTool(
  options: { readonly liveProjectRoot: string },
  launcher?: string,
): JestTool {
  if (launcher === undefined) {
    return { tool: { relativeToolPath: 'jest/bin/jest.js' }, leading: [], trailing: [] };
  }
  return {
    tool: { absoluteToolPath: launcherBinary(launcher, options.liveProjectRoot) },
    leading: ['test'],
    trailing: ['--watchAll=false'],
  };
}

export function jestScriptArguments(command: { readonly arguments_: readonly string[] }): string[] {
  return withoutOptions(command.arguments_, JEST_OPTIONS_NITPICKER_SETS);
}

export function jestArguments(
  command: { readonly arguments_: readonly string[] },
  nitpickerArguments: readonly string[],
  { leading, trailing }: Pick<JestTool, 'leading' | 'trailing'>,
): string[] {
  return [...leading, ...jestScriptArguments(command), ...nitpickerArguments, ...trailing];
}
