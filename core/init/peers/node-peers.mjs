import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';

const COVERAGE_PACKAGE = '@vitest/coverage-v8';
const RUNNER_PEERS = {
  vitest: ['vitest', COVERAGE_PACKAGE],
  jest: ['jest'],
  mocha: ['mocha'],
  node: [],
};
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

export function requiredNodePeers(testRunner) {
  return ['nitpicker', 'typescript', '@types/node', ...RUNNER_PEERS[testRunner]];
}

function installedManifest(projectRoot, name) {
  const found = ancestorDirectories(projectRoot)
    .map((directory) => path.join(directory, 'node_modules', name, 'package.json'))
    .find((file) => existsSync(file));
  return found === undefined ? undefined : JSON.parse(readFileSync(found, 'utf8'));
}

function isDeclared(manifest, name) {
  return DEPENDENCY_FIELDS.some((field) => manifest?.[field]?.[name] !== undefined);
}

function pinnedToVitest(projectRoot, name) {
  const version = installedManifest(projectRoot, 'vitest')?.version;
  return name === COVERAGE_PACKAGE && version !== undefined ? `${name}@${version}` : name;
}

export function missingNodePeers(projectRoot, testRunner) {
  const manifest = readManifest(projectRoot);
  return requiredNodePeers(testRunner)
    .filter(
      (name) => !isDeclared(manifest, name) && installedManifest(projectRoot, name) === undefined,
    )
    .map((name) => pinnedToVitest(projectRoot, name));
}
