import { findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VITEST_GLOBALS = 'vitest/globals';

const RUNNER_TYPES = {
  vitest: { types: VITEST_GLOBALS },
  jest: { types: 'jest', installedAs: '@types/jest' },
  mocha: { types: 'mocha', installedAs: '@types/mocha' },
};

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

export function runnerTypes(runner, projectDirectory) {
  const entry = RUNNER_TYPES[runner];
  if (entry === undefined) {
    return [];
  }
  const present =
    entry.installedAs === undefined || isInstalled(entry.installedAs, projectDirectory);
  return present ? [entry.types] : [];
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
