import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './contained-path.mjs';

const LOCKFILE_ORDER = [
  { name: 'pnpm', files: ['pnpm-lock.yaml'] },
  { name: 'yarn', files: ['yarn.lock'] },
  { name: 'bun', files: ['bun.lock', 'bun.lockb'] },
  { name: 'npm', files: ['package-lock.json', 'npm-shrinkwrap.json'] },
];

const LOCKFILE_NAMES = LOCKFILE_ORDER.flatMap(({ files }) => files);

export const DEPENDENCY_MANIFESTS = [
  'package.json',
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

function readProjectText(root, name) {
  const file = containedPath(root, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function ancestorsToRepository(start) {
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
  return [directories[0]];
}

export function managerRoot(projectRoot) {
  const holder = ancestorsToRepository(projectRoot).find((directory) =>
    LOCKFILE_NAMES.some((file) => existsSync(containedPath(directory, file))),
  );
  return holder ?? path.resolve(projectRoot);
}

function parsedManifest(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { kind: 'malformed-json' };
  }
}

function declaredPackageManager(root) {
  const text = readProjectText(root, 'package.json');
  const manifest = parsedManifest(text);
  const field =
    manifest.kind === 'malformed-json'
      ? PACKAGE_MANAGER_IN_TEXT.exec(text)?.groups.field
      : manifest.packageManager;
  return PACKAGE_MANAGER_FIELD.exec(typeof field === 'string' ? field : '')?.groups;
}

function managerFromLockfile(root) {
  return LOCKFILE_ORDER.find(({ files }) =>
    files.some((file) => existsSync(containedPath(root, file))),
  )?.name;
}

function majorFromVersion(version) {
  return /^\d+$/u.test(version) ? Number(version) : DEFAULT_BERRY_MAJOR;
}

function yarnMajor(root, declaredVersion) {
  if (declaredVersion !== undefined) {
    return majorFromVersion(declaredVersion);
  }
  const lockfile = readProjectText(root, 'yarn.lock');
  const metadata = /^__metadata:\s*\n\s+version:\s*(?<version>\d+)/mu.exec(lockfile)?.groups;
  if (metadata !== undefined) {
    return Number(metadata.version) <= BERRY_LOCKFILE_VERSION_BY_YARN_2
      ? FIRST_BERRY_MAJOR
      : DEFAULT_BERRY_MAJOR;
  }
  if (lockfile.includes('yarn lockfile v1')) {
    return 1;
  }
  return existsSync(containedPath(root, '.yarnrc.yml')) ? DEFAULT_BERRY_MAJOR : 1;
}

export function detectPackageManager(projectRoot) {
  const root = managerRoot(projectRoot);
  const declared = declaredPackageManager(root);
  const name = KNOWN_MANAGERS.has(declared?.name) ? declared.name : managerFromLockfile(root);
  if (name === undefined) {
    return { name: 'npm', root };
  }
  const declaredVersion = declared?.name === 'yarn' ? declared.version : undefined;
  return name === 'yarn' ? { name, root, major: yarnMajor(root, declaredVersion) } : { name, root };
}
