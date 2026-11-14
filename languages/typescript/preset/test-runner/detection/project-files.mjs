import { existsSync } from 'node:fs';
import path from 'node:path';

const VITEST = 'vitest';
const MOCHA = 'mocha';

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'];

const CONFIG_FILES = [
  [VITEST, ['vitest.config', 'vitest.workspace']],
  ['jest', ['jest.config']],
  [MOCHA, ['.mocharc']],
];

const MOCHA_CONFIG_EXTRA = ['.mocharc.yml', '.mocharc.yaml', '.mocharc.jsonc'];

const RUNNER_DEPENDENCIES = [
  [VITEST, [VITEST]],
  [
    'jest',
    [
      'jest',
      'ts-jest',
      'babel-jest',
      '@jest/globals',
      'react-scripts',
      '@craco/craco',
      'react-app-rewired',
      '@rescripts/cli',
    ],
  ],
  [MOCHA, [MOCHA]],
];

function configFileNames(runner, bases) {
  const names = bases.flatMap((base) =>
    CONFIG_EXTENSIONS.map((extension) => `${base}.${extension}`),
  );
  return runner === MOCHA ? [...names, ...MOCHA_CONFIG_EXTRA] : names;
}

function hasProjectFile(projectRoot, name) {
  const file = path.resolve(projectRoot, name);
  if (!file.startsWith(`${projectRoot}${path.sep}`)) {
    return false;
  }
  return existsSync(file);
}

function configFile(projectRoot, manifest, [runner, bases]) {
  const file = configFileNames(runner, bases).find((name) => hasProjectFile(projectRoot, name));
  if (file !== undefined) {
    return file;
  }
  return manifest[runner] === undefined ? undefined : `package.json "${runner}"`;
}

export function configEvidence(projectRoot, manifest) {
  return CONFIG_FILES.map((entry) => ({
    runner: entry[0],
    evidence: configFile(projectRoot, manifest, entry),
  })).filter(({ evidence }) => evidence !== undefined);
}

export function dependencyEvidence(manifest) {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  return RUNNER_DEPENDENCIES.map(([runner, packages]) => ({
    runner,
    dependency: packages.find((name) => names.has(name)),
  }))
    .filter(({ dependency }) => dependency !== undefined)
    .map(({ runner, dependency }) => ({ runner, evidence: `the ${dependency} dependency` }));
}
