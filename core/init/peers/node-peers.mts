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
import { describePackageManager } from '../detection/package-manager.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import { cappedRange, chooseVitest, minimumOf, typescriptRequirement } from './peer-pins.mts';
import type { FoundVersion, VitestPeerTable } from './peer-pins.mts';
import { satisfiesRange } from './version-range.mts';

const PEER_DEPENDENCIES = 'peerDependencies';

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
  readonly blockers: string[];
};

const COVERAGE_PACKAGE = '@vitest/coverage-v8';
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
const PEER_RANGES = fieldOf(manifestOf(PACKAGE_ROOT), PEER_DEPENDENCIES);
const NATIVE_TYPESCRIPT_MAJOR = 7;
const VITEST = 'vitest';
const OTHER_VITEST_PEERS: VitestPeerTable = {
  4: { vite: '^6.0.0 || ^7.0.0 || ^8.0.0' },
  5: { vite: '^6.4.0 || ^7.0.0 || ^8.0.0' },
};
function typescriptToolRange(): unknown {
  return fieldOf(
    fieldOf(installedManifest(PACKAGE_ROOT, 'typescript-eslint'), PEER_DEPENDENCIES),
    TYPESCRIPT,
  );
}

function javascriptApiTypeScript(): string {
  return `${TYPESCRIPT}@${cappedRange('^6', typescriptToolRange())}`;
}

export function vitestPeers(): VitestPeerTable {
  const own = installedManifest(PACKAGE_ROOT, VITEST);
  const major = Number(/\d+/u.exec(textOf(fieldOf(own, 'version')))?.[0]);
  const vite = fieldOf(fieldOf(own, PEER_DEPENDENCIES), 'vite');
  return typeof vite === 'string' && Number.isFinite(major)
    ? { ...OTHER_VITEST_PEERS, [major]: { vite } }
    : OTHER_VITEST_PEERS;
}

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
  const floor = minimumOf(supportedRange(name));
  const prerelease = installed !== undefined && /^\d+\.\d+\.\d+-/u.test(textOf(installed));
  if (prerelease && floor !== undefined) {
    return satisfiesRange(textOf(installed), `>=${floor}`);
  }
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

function foundVersion(projectRoot: string, name: string): FoundVersion | undefined {
  const installed = fieldOf(installedManifest(projectRoot, name), 'version');
  if (installed !== undefined) {
    return { exact: textOf(installed) };
  }
  const declared = declaredSpecifier(manifestOf(projectRoot), name);
  return typeof declared === 'string' && minimumOf(declared) !== undefined
    ? { declared }
    : undefined;
}

function vitestChoice(projectRoot: string) {
  return chooseVitest({
    supported: textOf(supportedRange(VITEST)),
    peers: vitestPeers(),
    versionOf: (name) => foundVersion(projectRoot, name),
    addCommand: textOf(describePackageManager(projectRoot).add),
  });
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
  const choice = added.some(({ name }) => name === VITEST) ? vitestChoice(projectRoot) : undefined;
  const blocked = choice?.kind === 'blocked';
  const kept = added.filter(
    ({ name }) => !(blocked && (name === VITEST || name === COVERAGE_PACKAGE)),
  );
  return {
    add: kept.map(({ name }) => requirementOf(projectRoot, name, { nodeVersion, choice })),
    uninstalled: statuses.filter((status) => !needsAdding(status)).map(({ name }) => name),
    absent: statuses.filter(({ installed }) => installed === undefined).map(({ name }) => name),
    outdated: statuses
      .filter(({ installed }) => installed !== undefined)
      .map(({ name, installed }) => ({ name, installed, range: supportedRange(name) })),
    blockers: choice?.kind === 'blocked' ? [choice.advice] : [],
  };
}

type RequirementContext = {
  readonly nodeVersion: string;
  readonly choice: ReturnType<typeof vitestChoice> | undefined;
};

function requirementOf(projectRoot: string, name: string, context: RequirementContext): string {
  if (name === NITPICKER) {
    return `${NITPICKER}@${textOf(packageVersion())}`;
  }
  if (name === TYPESCRIPT) {
    return redirects({ ...process.versions, node: context.nodeVersion })
      ? typescriptRequirement(textOf(supportedRange(TYPESCRIPT)), typescriptToolRange())
      : javascriptApiTypeScript();
  }
  if (context.choice?.kind === 'fits' && name === VITEST) {
    return context.choice.vitest;
  }
  if (context.choice?.kind === 'fits' && name === COVERAGE_PACKAGE) {
    return context.choice.coverage;
  }
  return pinnedToVitest(projectRoot, name);
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
        `Install Node.js ${minimum} or newer, or use TypeScript 6 (${javascriptApiTypeScript()}), ` +
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
