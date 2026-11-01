import { chainOf } from '../../shared/traversal.mjs';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findPackageJSON } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILE_NAME } from '../../shared/config.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../shared/messages/troubleshooting.mjs';

export const PACKAGE_ROOT = realpathSync(path.resolve(import.meta.dirname, '../..'));

export const SNAPSHOT_DIRECTORY_NAMES = ['base', 'head'];

export function resolveTool(name, { projectRoot, bin, packageRoot = PACKAGE_ROOT } = {}) {
  const { owningManifest, owningPeers, from } = owningTool(name, { projectRoot, packageRoot });
  const { root, installed } = installedTool(name, { owningManifest, owningPeers, from });
  return { root, version: installed.version, binPath: toolBinary(name, root, bin) };
}

export function isToolInstalled(name, { projectRoot, packageRoot = PACKAGE_ROOT } = {}) {
  const { from } = owningTool(name, { projectRoot, packageRoot });
  return packageFileOf(name, from) !== undefined;
}

function owningTool(name, { projectRoot, packageRoot }) {
  const trustedPackageRoot = realpathSync(packageRoot);
  const owningManifest = readManifest(path.join(trustedPackageRoot, 'package.json'));
  const owningPeers = new Set(Object.keys(owningManifest.peerDependencies ?? {}));
  const from = owningPeers.has(name) ? projectRoot : trustedPackageRoot;
  if (from === undefined) throw new Error(`Project root is required to resolve peer tool ${name}`);
  return { owningManifest, owningPeers, from };
}

function packageFileOf(name, from) {
  try {
    return findPackageJSON(name, pathToFileURL(path.join(from, 'package.json')).href);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

function installedTool(name, { owningManifest, owningPeers, from }) {
  const packageFile = packageFileOf(name, from);
  if (packageFile === undefined) {
    throw missingToolError(name, from, owningManifest.peerDependencies?.[name]);
  }
  const root = realpathSync(path.dirname(packageFile));
  if (isAnalyzedSnapshotPath(packageFile) || isAnalyzedSnapshotPath(root))
    throw new Error(`Tool ${name} must not resolve from an analyzed snapshot`);
  const installed = readManifest(path.join(root, 'package.json'));
  assertDeclaredPackage({
    name,
    installed,
    declared: declaredPackage(name, owningManifest.dependencies?.[name]),
    isPeer: owningPeers.has(name),
  });
  return { root, installed };
}

const VITEST_PACKAGES = new Set(['vitest', '@vitest/coverage-v8']);
const NPM_10_HINT =
  'If npm 10 failed to install it with "reading \'edgesOut\'", install with npm 11 ' +
  '(`npx npm@11 install`) or use Vitest 5';

export function missingToolMessage(name, from) {
  const message = `Required tool ${name} is not installed from ${from}`;
  return VITEST_PACKAGES.has(name) ? `${message}. ${NPM_10_HINT}` : message;
}

function missingToolError(name, from, peerRange) {
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

function toolBinary(name, root, bin) {
  if (bin === undefined) return undefined;
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

function assertDeclaredPackage({ name, installed, declared, isPeer }) {
  if (installed.name !== declared.name || typeof installed.version !== 'string') {
    throw new Error(`Invalid installed tool package for ${name}`);
  }
  if (!isPeer && installed.version !== declared.version) {
    throw new Error(
      `Tool ${name} version ${installed.version} does not match declared ${String(declared.version)}`,
    );
  }
}

function declaredPackage(name, specifier) {
  const alias = /^npm:(?<name>@?[^@]+)@(?<version>.+)$/u.exec(specifier ?? '');
  return alias === null
    ? { name, version: specifier }
    : { name: alias.groups.name, version: alias.groups.version };
}

export function toolNameForPath(relativeToolPath) {
  const parts = relativeToolPath.split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const PROJECT_MARKERS = ['package.json', CONFIG_FILE_NAME];

export function resolveProjectRoot(cwd = process.cwd()) {
  const current = realpathSync(cwd);
  const repositoryRoot = repositoryRootOf(current);
  const directories = chainOf(current, (directory) => {
    const parent = path.dirname(directory);
    return directory === repositoryRoot || directory === parent ? undefined : parent;
  });
  const projectRoot = directories.find((directory) =>
    PROJECT_MARKERS.some((marker) => existsSync(path.join(directory, marker))),
  );
  if (projectRoot !== undefined) return projectRoot;
  throw troubleshootingError(
    `No package.json or ${CONFIG_FILE_NAME} found between ${current} and repository root ${repositoryRoot}. ` +
      `For a Java, Kotlin, Python or Go project, create ${CONFIG_FILE_NAME} with its preset, for example {"preset": "java"}.`,
    TROUBLESHOOTING_ANCHORS.noProjectFound,
  );
}

function repositoryRootOf(directory) {
  try {
    return realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    );
  } catch (error) {
    const gitOutput = String(error?.stderr ?? '').trim();
    const gitSaid = gitOutput === '' ? '' : `\ngit said:\n${gitOutput}`;
    throw troubleshootingError(
      `${directory} is not inside a Git repository that git can read (or git is not installed). ` +
        `nitpicker compares your changes with their merge base, so run it inside a Git checkout.${gitSaid}`,
      TROUBLESHOOTING_ANCHORS.notAGitRepository,
      { cause: error },
    );
  }
}

function isAnalyzedSnapshotPath(candidate) {
  const relative = path.relative(realpathSync(tmpdir()), path.resolve(candidate));
  const isInsideTemporaryRoot =
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  return (
    isInsideTemporaryRoot &&
    relative.split(path.sep).some((segment) => segment.startsWith('nitpicker-diff-'))
  );
}

function readManifest(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read tool manifest ${file}`, { cause: error });
  }
}
