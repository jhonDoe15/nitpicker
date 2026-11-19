import { readFileSync, realpathSync, statSync } from 'node:fs';
import { fieldOf } from '../../shared/values/readers.mts';
import { findPackageJSON } from './package-lookup/package-json.mts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realTemporaryDirectory } from './temporary-files.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../shared/messages/troubleshooting.mjs';
import type {
  Declared,
  DeclaredCheck,
  Manifest,
  OwnerRequest,
  OwningTool,
  ResolvedTool,
  ToolOptions,
} from './typed/tool-types.mts';

const parseManifest: (text: string) => Manifest = JSON.parse;

const PACKAGE_MANIFEST = 'package.json';

export const PACKAGE_ROOT = realpathSync(path.resolve(import.meta.dirname, '../..'));

export const SNAPSHOT_DIRECTORY_NAMES = ['base', 'head'];

export function resolveTool(
  name: string,
  options: ToolOptions & { readonly bin: string },
): ResolvedTool & { binPath: string };
export function resolveTool(name: string, options?: ToolOptions): ResolvedTool;
export function resolveTool(
  name: string,
  { projectRoot, bin, packageRoot = PACKAGE_ROOT }: ToolOptions = {},
): ResolvedTool {
  const { owningManifest, owningPeers, from } = owningTool(name, { projectRoot, packageRoot });
  const { root, version } = installedTool(name, { owningManifest, owningPeers, from });
  return { root, version, binPath: toolBinary(name, root, bin) };
}

export function isToolInstalled(
  name: string,
  { projectRoot, packageRoot = PACKAGE_ROOT }: ToolOptions = {},
): boolean {
  const { from } = owningTool(name, { projectRoot, packageRoot });
  return packageFileOf(name, from) !== undefined;
}

function owningTool(name: string, { projectRoot, packageRoot }: OwnerRequest): OwningTool {
  const trustedPackageRoot = realpathSync(packageRoot);
  const owningManifest = readManifest(path.join(trustedPackageRoot, PACKAGE_MANIFEST));
  const owningPeers = new Set(Object.keys(owningManifest.peerDependencies ?? {}));
  const from = owningPeers.has(name) ? projectRoot : trustedPackageRoot;
  if (from === undefined) {
    throw new Error(`Project root is required to resolve peer tool ${name}`);
  }
  return { owningManifest, owningPeers, from };
}

function packageFileOf(name: string, from: string): string | undefined {
  try {
    return findPackageJSON(name, pathToFileURL(path.join(from, PACKAGE_MANIFEST)).href);
  } catch (error) {
    if (fieldOf(error, 'code') === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

function installedTool(name: string, { owningManifest, owningPeers, from }: OwningTool) {
  const packageFile = packageFileOf(name, from);
  if (packageFile === undefined) {
    throw missingToolError(name, from, owningManifest.peerDependencies?.[name]);
  }
  const root = realpathSync(path.dirname(packageFile));
  if (isAnalyzedSnapshotPath(packageFile) || isAnalyzedSnapshotPath(root)) {
    throw new Error(`Tool ${name} must not resolve from an analyzed snapshot`);
  }
  const installed = readManifest(path.join(root, PACKAGE_MANIFEST));
  const version = assertDeclaredPackage({
    name,
    installed,
    declared: declaredPackage(name, owningManifest.dependencies?.[name]),
    isPeer: owningPeers.has(name),
  });
  return { root, version };
}

const VITEST_PACKAGES = new Set(['vitest', '@vitest/coverage-v8']);
const NPM_10_HINT =
  'If npm 10 failed to install it with "reading \'edgesOut\'", install with npm 11 ' +
  '(`npx npm@11 install`) or use Vitest 5';

export function missingToolMessage(name: string, from: string): string {
  const message = `Required tool ${name} is not installed from ${from}`;
  return VITEST_PACKAGES.has(name) ? `${message}. ${NPM_10_HINT}` : message;
}

function missingToolError(name: string, from: string, peerRange: string | undefined): Error {
  if (peerRange === undefined) {
    return new Error(missingToolMessage(name, from));
  }
  const message = `Required tool ${name} is not installed from ${from}`;
  const hint = VITEST_PACKAGES.has(name) ? ` ${NPM_10_HINT}.` : '';
  return troubleshootingError(
    `${message}. Install ${name} ${peerRange} as a dev dependency of the project.${hint}`,
    TROUBLESHOOTING_ANCHORS.missingPeer,
  );
}

function toolBinary(name: string, root: string, bin: string | undefined): string | undefined {
  if (bin === undefined) {
    return undefined;
  }
  const binPath = realpathSync(path.join(root, bin));
  const relative = path.relative(root, binPath);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    !statSync(binPath).isFile()
  ) {
    throw new Error(`Tool ${name} binary must stay inside its package`);
  }
  return binPath;
}

const PEER_DISTRIBUTIONS: ReadonlyMap<string, RegExp> = new Map([
  ['typescript', /^@typescript\/typescript\d+$/u],
]);

function isDeclaredName(
  installedName: unknown,
  { declared, isPeer }: Pick<DeclaredCheck, 'declared' | 'isPeer'>,
): boolean {
  if (installedName === declared.name) {
    return true;
  }
  return (
    isPeer &&
    typeof installedName === 'string' &&
    PEER_DISTRIBUTIONS.get(declared.name)?.test(installedName) === true
  );
}

function assertDeclaredPackage({ name, installed, declared, isPeer }: DeclaredCheck): string {
  const { version } = installed;
  if (!isDeclaredName(installed.name, { declared, isPeer }) || typeof version !== 'string') {
    throw new Error(`Invalid installed tool package for ${name}`);
  }
  if (!isPeer && version !== declared.version) {
    throw new Error(
      `Tool ${name} version ${version} does not match declared ${String(declared.version)}`,
    );
  }
  return version;
}

function declaredPackage(name: string, specifier: string | undefined): Declared {
  const alias = /^npm:(?<name>@?[^@]+)@(?<version>.+)$/u.exec(specifier ?? '');
  return alias === null
    ? { name, version: specifier }
    : { name: alias.groups?.['name'] ?? '', version: alias.groups?.['version'] ?? '' };
}

export function toolNameForPath(relativeToolPath: string): string {
  const parts = relativeToolPath.split('/');
  const first = parts[0] ?? '';
  return first.startsWith('@') ? parts.slice(0, 2).join('/') : first;
}

function isAnalyzedSnapshotPath(candidate: string): boolean {
  const relative = path.relative(realTemporaryDirectory(), path.resolve(candidate));
  const isInsideTemporaryRoot =
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  return (
    isInsideTemporaryRoot &&
    relative.split(path.sep).some((segment) => segment.startsWith('nitpicker-diff-'))
  );
}

function readManifest(file: string): Manifest {
  try {
    return parseManifest(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read tool manifest ${file}`, { cause: error });
  }
}
