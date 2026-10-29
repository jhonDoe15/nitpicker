import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import {
  MINIMUM_NODE,
  supportsRedirect,
} from '../../../languages/typescript/typescript-api/api-redirect.mjs';
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
const NATIVE_TYPESCRIPT_MAJOR = 7;
const JAVASCRIPT_API_TYPESCRIPT = `${TYPESCRIPT}@^6`;

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

function requirementOf(projectRoot, name, nodeVersion) {
  if (name === NITPICKER) {
    return `${NITPICKER}@${packageVersion()}`;
  }
  if (name === TYPESCRIPT && !supportsRedirect({ node: nodeVersion })) {
    return JAVASCRIPT_API_TYPESCRIPT;
  }
  return pinnedToVitest(projectRoot, name);
}

function pinnedToVitest(projectRoot, name) {
  const version = installedManifest(projectRoot, 'vitest')?.version;
  return name === COVERAGE_PACKAGE && version !== undefined ? `${name}@${version}` : name;
}

function projectTypeScript(projectRoot) {
  const installed = installedManifest(projectRoot, TYPESCRIPT)?.version;
  if (installed !== undefined) {
    return { version: installed, source: 'installed' };
  }
  const declared = declaredSpecifier(readManifest(projectRoot), TYPESCRIPT);
  return declared === undefined ? undefined : { version: declared, source: 'declared' };
}

export function assertTypeScriptNode(projectRoot, nodeVersion = process.versions.node) {
  const typeScript = projectTypeScript(projectRoot);
  const major = Number(FIRST_VERSION.exec(String(typeScript?.version ?? ''))?.groups.major);
  if (major >= NATIVE_TYPESCRIPT_MAJOR && !supportsRedirect({ node: nodeVersion })) {
    const minimum = MINIMUM_NODE.join('.');
    throw new Error(
      `This project uses TypeScript ${major} (${typeScript.version} ${typeScript.source}). nitpicker reads a TypeScript 7 project through its own TypeScript 6 API, which needs Node.js ${minimum} or newer, and this is Node.js ${nodeVersion}. Install Node.js ${minimum} or newer, or use TypeScript 6 (${JAVASCRIPT_API_TYPESCRIPT}), and run nitpicker init again.`,
    );
  }
}

export function missingNodePeers(projectRoot, testRunner, nodeVersion = process.versions.node) {
  const manifest = readManifest(projectRoot);
  return requiredNodePeers(testRunner)
    .filter((name) => !isPresent(projectRoot, manifest, name))
    .map((name) => requirementOf(projectRoot, name, nodeVersion));
}
