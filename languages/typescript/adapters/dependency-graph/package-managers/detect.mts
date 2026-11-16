import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './contained-path.mts';
import type { ManagerAtRoot } from './commands.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

const LOCKFILE_ORDER = [
  { name: 'pnpm', files: ['pnpm-lock.yaml'] },
  { name: 'yarn', files: ['yarn.lock'] },
  { name: 'bun', files: ['bun.lock', 'bun.lockb'] },
  { name: 'npm', files: ['package-lock.json', 'npm-shrinkwrap.json'] },
];

const LOCKFILE_NAMES = LOCKFILE_ORDER.flatMap(({ files }) => files);
const MANIFEST = 'package.json';

export const DEPENDENCY_MANIFESTS = [
  MANIFEST,
  ...LOCKFILE_NAMES,
  'pnpm-workspace.yaml',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'bunfig.toml',
];

const KNOWN_MANAGERS = new Set(LOCKFILE_ORDER.map(({ name }) => name));
const PACKAGE_MANAGER_FIELD = /^(?<name>[a-z]+)@[\^~]?(?<version>\d+|berry|stable|canary)/u;
const PACKAGE_MANAGER_IN_TEXT = /"packageManager"\s*:\s*"(?<field>[^"]*)"/u;
const BERRY_LOCKFILE_VERSION_BY_YARN_2 = 4;
const FIRST_BERRY_MAJOR = 2;
const DEFAULT_BERRY_MAJOR = 3;

function readProjectText(root: string, name: string): string {
  const file = containedPath(root, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function ancestorsToRepository(start: string): string[] {
  const directories = [path.resolve(start)];
  for (const directory of directories) {
    const parent = path.dirname(directory);
    const isRepositoryRoot = existsSync(containedPath(directory, '.git'));
    if (isRepositoryRoot) {
      return directories;
    }
    if (parent !== directory) {
      directories.push(parent);
    }
  }
  return [path.resolve(start)];
}

function declaresWorkspaces(directory: string): boolean {
  if (existsSync(containedPath(directory, 'pnpm-workspace.yaml'))) {
    return true;
  }
  const workspaces = fieldOf(parsedManifest(readProjectText(directory, MANIFEST)), 'workspaces');
  return Array.isArray(workspaces) || Array.isArray(fieldOf(workspaces, 'packages'));
}

export function managerRoot(projectRoot: string): string {
  const ancestors = ancestorsToRepository(projectRoot);
  const holder =
    ancestors.find((directory) =>
      LOCKFILE_NAMES.some((file) => existsSync(containedPath(directory, file))),
    ) ?? ancestors.find(declaresWorkspaces);
  return holder ?? path.resolve(projectRoot);
}

function parsedManifest(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { kind: 'malformed-json' };
  }
}

function declaredPackageManager(root: string): { name?: string; version?: string } | undefined {
  const text = readProjectText(root, MANIFEST);
  const manifest = parsedManifest(text);
  const field =
    fieldOf(manifest, 'kind') === 'malformed-json'
      ? PACKAGE_MANAGER_IN_TEXT.exec(text)?.groups?.['field']
      : fieldOf(manifest, 'packageManager');
  return PACKAGE_MANAGER_FIELD.exec(typeof field === 'string' ? field : '')?.groups;
}

function managerFromLockfile(root: string): string | undefined {
  return LOCKFILE_ORDER.find(({ files }) =>
    files.some((file) => existsSync(containedPath(root, file))),
  )?.name;
}

function majorFromVersion(version: string): number {
  return /^\d+$/u.test(version) ? Number(version) : DEFAULT_BERRY_MAJOR;
}

function yarnMajor(root: string, declaredVersion: string | undefined): number {
  if (declaredVersion !== undefined) {
    return majorFromVersion(declaredVersion);
  }
  const lockfile = readProjectText(root, 'yarn.lock');
  const metadata = /^__metadata:[ \t]*\n[ \t]+version:[ \t]*(?<version>\d+)/mu.exec(
    lockfile,
  )?.groups;
  if (metadata !== undefined) {
    return Number(metadata['version']) <= BERRY_LOCKFILE_VERSION_BY_YARN_2
      ? FIRST_BERRY_MAJOR
      : DEFAULT_BERRY_MAJOR;
  }
  if (lockfile.includes('yarn lockfile v1')) {
    return 1;
  }
  return existsSync(containedPath(root, '.yarnrc.yml')) ? DEFAULT_BERRY_MAJOR : 1;
}

export function detectPackageManager(projectRoot: string): ManagerAtRoot {
  const root = managerRoot(projectRoot);
  const declared = declaredPackageManager(root);
  const declaredName = declared?.name;
  const name =
    declaredName !== undefined && KNOWN_MANAGERS.has(declaredName)
      ? declaredName
      : managerFromLockfile(root);
  if (name === undefined) {
    return { name: 'npm', root };
  }
  const declaredVersion = declaredName === 'yarn' ? declared?.version : undefined;
  return name === 'yarn' ? { name, root, major: yarnMajor(root, declaredVersion) } : { name, root };
}
