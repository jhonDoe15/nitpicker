import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import {
  MINIMUM_NODE,
  supportsRedirect,
} from '../../../languages/typescript/typescript-api/api-redirect.mjs';
import { packageVersion } from '../../help/package-version.mts';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type PeerVersions = { readonly installed?: unknown; readonly declared?: unknown };

type PeerStatus = PeerVersions & { readonly name: string; readonly supported: boolean };

type PeerOptions = {
  readonly nodeVersion?: string;
  readonly loadedFrom?: Readonly<Record<string, string>>;
};

type ProjectTypeScript = { readonly version: unknown; readonly source: string };

const ancestorsOf: (directory: string) => string[] = ancestorDirectories;
const manifestOf: (projectRoot: string) => unknown = readManifest;
const redirects: (versions: NodeJS.ProcessVersions) => boolean = supportsRedirect;
const minimumNode: readonly number[] = MINIMUM_NODE;

export type PeerNeeds = {
  readonly add: string[];
  readonly uninstalled: string[];
  readonly absent: string[];
  readonly outdated: {
    readonly name: string;
    readonly installed: unknown;
    readonly range: unknown;
  }[];
};

const COVERAGE_PACKAGE = '@vitest/coverage-v8';
const VITEST = 'vitest';
const RUNNER_PEERS: Readonly<Record<string, readonly string[]>> = {
  vitest: ['vitest', COVERAGE_PACKAGE],
  jest: ['jest'],
  mocha: ['mocha'],
  node: [],
};
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const TYPESCRIPT = 'typescript';
const NITPICKER = 'nitpicker';
const FIRST_VERSION = /(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?/u;
const PEER_RANGES = fieldOf(manifestOf(PACKAGE_ROOT), 'peerDependencies');
const NATIVE_TYPESCRIPT_MAJOR = 7;
const JAVASCRIPT_API_TYPESCRIPT = `${TYPESCRIPT}@^6`;

export function runnerPeers(testRunner: string | undefined): readonly string[] {
  return RUNNER_PEERS[textOf(testRunner)] ?? [];
}

export function requiredNodePeers(testRunner: string | undefined): string[] {
  return [NITPICKER, TYPESCRIPT, '@types/node', ...runnerPeers(testRunner)];
}

function installedManifest(projectRoot: string, name: string): unknown {
  const found = ancestorsOf(projectRoot)
    .map((directory) => path.join(directory, 'node_modules', name, 'package.json'))
    .find((file) => existsSync(file));
  return found === undefined ? undefined : JSON.parse(readFileSync(found, 'utf8'));
}

function declaredSpecifier(manifest: unknown, name: string): unknown {
  return DEPENDENCY_FIELDS.map((field) => fieldOf(fieldOf(manifest, field), name)).find(
    (specifier) => specifier !== undefined,
  );
}

function versionParts(text: unknown): number[] {
  const found = FIRST_VERSION.exec(String(text))?.groups;
  return [found?.['major'], found?.['minor'], found?.['patch']]
    .filter((part) => part !== undefined)
    .map(Number);
}

function declaredVersionParts(declared: unknown): number[] {
  const protocol = /^(?<name>[\w+-]+):/u.exec(String(declared))?.groups?.['name'];
  return protocol === undefined || protocol === 'npm' ? versionParts(declared).slice(0, 2) : [];
}

function isAtLeast(version: readonly number[], minimum: readonly number[]): boolean {
  const index = version.findIndex((part, position) => part !== (minimum[position] ?? 0));
  return index === -1 || (version[index] ?? 0) > (minimum[index] ?? 0);
}

function supportedRange(name: string): unknown {
  return fieldOf(PEER_RANGES, name);
}

function isSupported(name: string, { installed, declared }: PeerVersions): boolean {
  const minimum = versionParts(supportedRange(name));
  const version =
    installed === undefined ? declaredVersionParts(declared) : versionParts(installed);
  return version.length === 0 || minimum.length === 0 || isAtLeast(version, minimum);
}

function peerStatus(
  projectRoot: string,
  manifest: unknown,
  { name, loadedFrom }: { readonly name: string; readonly loadedFrom: string | undefined },
): PeerStatus {
  const found = installedManifest(projectRoot, name);
  const fallback =
    loadedFrom === undefined || loadedFrom === '' ? undefined : installedManifest(loadedFrom, name);
  const installed = fieldOf(found ?? fallback, 'version');
  const declared = declaredSpecifier(manifest, name);
  return { name, installed, declared, supported: isSupported(name, { installed, declared }) };
}

function needsAdding({ installed, declared, supported }: PeerStatus): boolean {
  return !supported || (installed === undefined && declared === undefined);
}

export function nodePeerNeeds(
  projectRoot: string,
  names: readonly string[],
  options: PeerOptions = {},
): PeerNeeds {
  const { nodeVersion = process.versions.node, loadedFrom = {} } = options;
  const manifest = manifestOf(projectRoot);
  const statuses = names
    .map((name) => peerStatus(projectRoot, manifest, { name, loadedFrom: loadedFrom[name] }))
    .filter(({ installed, supported }) => installed === undefined || !supported);
  const added = statuses.filter(needsAdding);
  const vitestIsOld = added.some(({ name, supported }) => name === VITEST && !supported);
  return {
    add: added.map((status) => requirementOf(projectRoot, status, { nodeVersion, vitestIsOld })),
    uninstalled: statuses.filter((status) => !needsAdding(status)).map(({ name }) => name),
    absent: statuses.filter(({ installed }) => installed === undefined).map(({ name }) => name),
    outdated: statuses
      .filter(({ installed }) => installed !== undefined)
      .map(({ name, installed }) => ({ name, installed, range: supportedRange(name) })),
  };
}

const OPEN_LOWER_BOUND = /^>=\s*(?<version>[^\s<>=]+)$/u;

export function lowestClause(range: string): string | undefined {
  const [first = ''] = range.split('||');
  const clause = first.trim();
  const version = OPEN_LOWER_BOUND.exec(clause)?.groups?.['version'];
  if (clause === '') {
    return undefined;
  }
  return version === undefined ? clause : `^${version}`;
}

function lowestRange(name: string): string | undefined {
  return lowestClause(textOf(supportedRange(name)));
}

type RequirementContext = { readonly nodeVersion: string; readonly vitestIsOld: boolean };

function requirementOf(
  projectRoot: string,
  { name, supported, declared }: PeerStatus,
  { nodeVersion, vitestIsOld }: RequirementContext,
): string {
  if (name === NITPICKER) {
    return `${NITPICKER}@${textOf(packageVersion())}`;
  }
  if (name === TYPESCRIPT && !redirects({ ...process.versions, node: nodeVersion })) {
    return JAVASCRIPT_API_TYPESCRIPT;
  }
  const declaredFine = declared !== undefined && isSupported(name, { declared });
  const old = !(supported || declaredFine) || (name === COVERAGE_PACKAGE && vitestIsOld);
  const range = lowestRange(name === COVERAGE_PACKAGE ? VITEST : name);
  return old && range !== undefined ? `${name}@${range}` : pinnedToVitest(projectRoot, name);
}

function pinnedToVitest(projectRoot: string, name: string): string {
  const version = fieldOf(installedManifest(projectRoot, 'vitest'), 'version');
  const pinned = version !== undefined && isSupported('vitest', { installed: version });
  return name === COVERAGE_PACKAGE && pinned ? `${name}@${textOf(version)}` : name;
}

function projectTypeScript(projectRoot: string): ProjectTypeScript | undefined {
  const installed = fieldOf(installedManifest(projectRoot, TYPESCRIPT), 'version');
  if (installed !== undefined) {
    return { version: installed, source: 'installed' };
  }
  const declared = declaredSpecifier(manifestOf(projectRoot), TYPESCRIPT);
  return declared === undefined ? undefined : { version: declared, source: 'declared' };
}

export function assertTypeScriptNode(
  projectRoot: string,
  nodeVersion: string = process.versions.node,
): void {
  const typeScript = projectTypeScript(projectRoot);
  const major = Number(FIRST_VERSION.exec(textOf(typeScript?.version ?? ''))?.groups?.['major']);
  if (
    typeScript !== undefined &&
    major >= NATIVE_TYPESCRIPT_MAJOR &&
    !redirects({ ...process.versions, node: nodeVersion })
  ) {
    const minimum = minimumNode.join('.');
    const used = `${textOf(typeScript.version)} ${typeScript.source}`;
    throw new Error(
      `This project uses TypeScript ${String(major)} (${used}). ` +
        'nitpicker reads a TypeScript 7 project through its own TypeScript 6 API, ' +
        `which needs Node.js ${minimum} or newer, and this is Node.js ${nodeVersion}. ` +
        `Install Node.js ${minimum} or newer, or use TypeScript 6 (${JAVASCRIPT_API_TYPESCRIPT}), ` +
        'and run nitpicker init again.',
    );
  }
}

export function missingNodePeers(
  projectRoot: string,
  testRunner: string | undefined,
  nodeVersion: string = process.versions.node,
): PeerNeeds {
  return nodePeerNeeds(projectRoot, requiredNodePeers(testRunner), { nodeVersion });
}
