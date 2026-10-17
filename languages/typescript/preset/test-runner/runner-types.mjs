import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RUNNER_NAMES } from './runners.mjs';

const VITEST_GLOBALS = 'vitest/globals';

const RUNNER_TYPES = {
  vitest: { types: VITEST_GLOBALS },
  jest: { types: 'jest', installedAs: '@types/jest', globals: 'jest' },
  mocha: { types: 'mocha', installedAs: '@types/mocha', globals: 'mocha' },
};
const TEST_RUNNER_TYPES_MISSING = new Set([2582, 2593]);
const CANNOT_FIND_NAME = 2304;
const TYPE_CHECK_ANALYZER = 'typescript-typecheck';

function lookup(packageName, projectDirectory) {
  const from = pathToFileURL(path.join(projectDirectory, 'package.json')).href;
  try {
    return { installed: findPackageJSON(packageName, from) !== undefined };
  } catch (error) {
    return { installed: false, reason: String(error) };
  }
}

function isInstalled(packageName, projectDirectory) {
  return lookup(packageName, projectDirectory).installed;
}

export function missingRunnerTypes(runner, projectDirectory) {
  const packageName = RUNNER_TYPES[runner]?.installedAs;
  return packageName === undefined || isInstalled(packageName, projectDirectory)
    ? undefined
    : packageName;
}

export function runnerTypes(runner, projectDirectory) {
  const entry = RUNNER_TYPES[runner];
  if (entry === undefined) {
    return [];
  }
  return missingRunnerTypes(runner, projectDirectory) === undefined ? [entry.types] : [];
}

function diagnosticName(diagnostic) {
  const { file, start, length } = diagnostic;
  return file === undefined || start === undefined ? '' : file.text.slice(start, start + length);
}

function runnerGlobals(key) {
  return createRequire(import.meta.url)('globals')[key];
}

export function isUntypedRunnerGlobal(diagnostic, runner) {
  if (TEST_RUNNER_TYPES_MISSING.has(diagnostic.code)) {
    return true;
  }
  const globalsKey = RUNNER_TYPES[runner]?.globals;
  if (diagnostic.code !== CANNOT_FIND_NAME || globalsKey === undefined) {
    return false;
  }
  return Object.hasOwn(runnerGlobals(globalsKey), diagnosticName(diagnostic));
}

export function runnerTypesNotices(runner, { projectDirectory, analyzers }) {
  const packageName = missingRunnerTypes(runner, projectDirectory);
  if (packageName === undefined || !analyzers.some(({ name }) => name === TYPE_CHECK_ANALYZER)) {
    return [];
  }
  return [
    `The project runs its tests with ${RUNNER_NAMES[runner]}, but ${packageName} is not installed, ` +
      `so the type check does not know the ${RUNNER_NAMES[runner]} globals and does not report the ` +
      `errors they cause in test files. Install ${packageName} (npm install --save-dev ${packageName}) ` +
      'to have the tests type checked against them.',
  ];
}

export function withRunnerTypes(text, { runner, projectDirectory }) {
  const config = JSON.parse(text);
  const current = config.compilerOptions?.types;
  if (!Array.isArray(current) || !current.includes(VITEST_GLOBALS)) {
    return text;
  }
  const types = current.flatMap((type) =>
    type === VITEST_GLOBALS ? runnerTypes(runner, projectDirectory) : [type],
  );
  if (JSON.stringify(types) === JSON.stringify(current)) {
    return text;
  }
  return `${JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, types } }, null, 2)}\n`;
}
