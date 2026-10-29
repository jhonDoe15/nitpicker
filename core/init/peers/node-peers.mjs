import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { packageVersion } from '../../help/package-version.mjs';

const COVERAGE_PACKAGE = '@vitest/coverage-v8';
const RUNNER_PEERS = {
  vitest: ['vitest', COVERAGE_PACKAGE],
  jest: ['jest'],
  mocha: ['mocha'],
  node: [],
};
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const TYPESCRIPT = 'typescript';
const NITPICKER = 'nitpicker';
const FIRST_VERSION = /(?<major>\d+)(?:\.(?<minor>\d+))?/u;
const OLDEST_TYPESCRIPT = [5, 7];

export function requiredNodePeers(testRunner) {
  return [NITPICKER, TYPESCRIPT, '@types/node', ...RUNNER_PEERS[testRunner]];
}

function installedManifest(projectRoot, name) {
  const found = ancestorDirectories(projectRoot)
    .map((directory) => path.join(directory, 'node_modules', name, 'package.json'))
    .find((file) => existsSync(file));
  return found === undefined ? undefined : JSON.parse(readFileSync(found, 'utf8'));
}

function declaredSpecifier(manifest, name) {
  return DEPENDENCY_FIELDS.map((field) => manifest?.[field]?.[name]).find(
    (specifier) => specifier !== undefined,
  );
}

function isSupportedTypeScript(version) {
  if (version === undefined) {
    return false;
  }
  const found = FIRST_VERSION.exec(String(version))?.groups;
  if (found === undefined) {
    return true;
  }
  const [major, minor] = [Number(found.major), Number(found.minor ?? 0)];
  const [oldestMajor, oldestMinor] = OLDEST_TYPESCRIPT;
  return major === oldestMajor ? minor >= oldestMinor : major > oldestMajor;
}

function isPresent(projectRoot, manifest, name) {
  const installed = installedManifest(projectRoot, name)?.version;
  const declared = declaredSpecifier(manifest, name);
  if (name !== TYPESCRIPT) {
    return installed !== undefined || declared !== undefined;
  }
  return installed === undefined
    ? isSupportedTypeScript(declared)
    : isSupportedTypeScript(installed);
}

function requirementOf(projectRoot, name) {
  if (name === NITPICKER) {
    return `${NITPICKER}@${packageVersion()}`;
  }
  return pinnedToVitest(projectRoot, name);
}

function pinnedToVitest(projectRoot, name) {
  const version = installedManifest(projectRoot, 'vitest')?.version;
  return name === COVERAGE_PACKAGE && version !== undefined ? `${name}@${version}` : name;
}

export function missingNodePeers(projectRoot, testRunner) {
  const manifest = readManifest(projectRoot);
  return requiredNodePeers(testRunner)
    .filter((name) => !isPresent(projectRoot, manifest, name))
    .map((name) => requirementOf(projectRoot, name));
}
