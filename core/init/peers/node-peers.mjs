import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import {
  MINIMUM_NODE,
  supportsRedirect,
} from '../../../languages/typescript/typescript-api/api-redirect.mjs';
import { packageVersion } from '../../help/package-version.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

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
const FIRST_VERSION = /(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?/u;
const PEER_RANGES = readManifest(PACKAGE_ROOT).peerDependencies;
const NATIVE_TYPESCRIPT_MAJOR = 7;
const JAVASCRIPT_API_TYPESCRIPT = `${TYPESCRIPT}@^6`;

export function runnerPeers(testRunner) {
  return RUNNER_PEERS[testRunner];
}

export function requiredNodePeers(testRunner) {
  return [NITPICKER, TYPESCRIPT, '@types/node', ...runnerPeers(testRunner)];
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

function versionParts(text) {
  const found = FIRST_VERSION.exec(String(text))?.groups;
  return [found?.major, found?.minor, found?.patch]
    .filter((part) => part !== undefined)
    .map(Number);
}

function declaredVersionParts(declared) {
  const protocol = /^(?<name>[\w+-]+):/u.exec(String(declared))?.groups.name;
  return protocol === undefined || protocol === 'npm' ? versionParts(declared).slice(0, 2) : [];
}

function isAtLeast(version, minimum) {
  const index = version.findIndex((part, position) => part !== (minimum[position] ?? 0));
  return index === -1 || version[index] > (minimum[index] ?? 0);
}

function supportedRange(name) {
  return PEER_RANGES[name];
}

function isSupported(name, { installed, declared }) {
  const minimum = versionParts(supportedRange(name));
  const version =
    installed === undefined ? declaredVersionParts(declared) : versionParts(installed);
  return version.length === 0 || minimum.length === 0 || isAtLeast(version, minimum);
}

function peerStatus(projectRoot, manifest, name) {
  const installed = installedManifest(projectRoot, name)?.version;
  const declared = declaredSpecifier(manifest, name);
  return { name, installed, declared, supported: isSupported(name, { installed, declared }) };
}

function needsAdding({ installed, declared, supported }) {
  return !supported || (installed === undefined && declared === undefined);
}

export function nodePeerNeeds(projectRoot, names, nodeVersion = process.versions.node) {
  const manifest = readManifest(projectRoot);
  const statuses = names
    .map((name) => peerStatus(projectRoot, manifest, name))
    .filter(({ installed, supported }) => installed === undefined || !supported);
  const added = statuses.filter(needsAdding);
  return {
    add: added.map(({ name }) => requirementOf(projectRoot, name, nodeVersion)),
    uninstalled: statuses.filter((status) => !needsAdding(status)).map(({ name }) => name),
    absent: statuses.filter(({ installed }) => installed === undefined).map(({ name }) => name),
    outdated: statuses
      .filter(({ installed }) => installed !== undefined)
      .map(({ name, installed }) => ({ name, installed, range: supportedRange(name) })),
  };
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
  const pinned = version !== undefined && isSupported('vitest', { installed: version });
  return name === COVERAGE_PACKAGE && pinned ? `${name}@${version}` : name;
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
  return nodePeerNeeds(projectRoot, requiredNodePeers(testRunner), nodeVersion);
}
