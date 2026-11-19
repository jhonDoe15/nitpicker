import { existsSync } from 'node:fs';
import path from 'node:path';
import { fieldsOf } from '../../../../../shared/values/readers.mts';
import type { PackageManifest, RunnerEvidence } from '../typed/command-types.mts';

type RunnerEntry = readonly [string, readonly string[]];

const VITEST = 'vitest';
const MOCHA = 'mocha';

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'];

const CONFIG_FILES: readonly RunnerEntry[] = [
  [VITEST, ['vitest.config', 'vitest.workspace']],
  ['jest', ['jest.config']],
  [MOCHA, ['.mocharc']],
];

const MOCHA_CONFIG_EXTRA = ['.mocharc.yml', '.mocharc.yaml', '.mocharc.jsonc'];

const RUNNER_DEPENDENCIES: readonly RunnerEntry[] = [
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

function hasEvidence(entry: {
  readonly runner: string;
  readonly evidence: string | undefined;
}): entry is RunnerEvidence {
  return entry.evidence !== undefined;
}

function configFileNames(runner: string, bases: readonly string[]): string[] {
  const names = bases.flatMap((base) =>
    CONFIG_EXTENSIONS.map((extension) => `${base}.${extension}`),
  );
  return runner === MOCHA ? [...names, ...MOCHA_CONFIG_EXTRA] : names;
}

export function hasProjectFile(projectRoot: string, name: string): boolean {
  const file = path.resolve(projectRoot, name);
  if (!file.startsWith(`${projectRoot}${path.sep}`)) {
    return false;
  }
  return existsSync(file);
}

function configFile(
  projectRoot: string,
  manifest: PackageManifest,
  [runner, bases]: RunnerEntry,
): string | undefined {
  const file = configFileNames(runner, bases).find((name) => hasProjectFile(projectRoot, name));
  if (file !== undefined) {
    return file;
  }
  return manifest[runner] === undefined ? undefined : `package.json "${runner}"`;
}

export function configEvidence(projectRoot: string, manifest: PackageManifest): RunnerEvidence[] {
  return CONFIG_FILES.map((entry) => ({
    runner: entry[0],
    evidence: configFile(projectRoot, manifest, entry),
  })).filter(hasEvidence);
}

export function dependencyEvidence(manifest: PackageManifest): RunnerEvidence[] {
  const names = new Set([
    ...Object.keys(fieldsOf(manifest['dependencies'])),
    ...Object.keys(fieldsOf(manifest['devDependencies'])),
  ]);
  return RUNNER_DEPENDENCIES.map(([runner, packages]) => ({
    runner,
    dependency: packages.find((name) => names.has(name)),
  })).flatMap(({ runner, dependency }) =>
    dependency === undefined ? [] : [{ runner, evidence: `the ${dependency} dependency` }],
  );
}
