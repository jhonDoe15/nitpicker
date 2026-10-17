import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from './contained-path.mjs';

export const DEPENDENCY_MANIFESTS = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];

const LOCKFILE_ORDER = [
  { name: 'pnpm', files: ['pnpm-lock.yaml'] },
  { name: 'yarn', files: ['yarn.lock'] },
  { name: 'bun', files: ['bun.lock', 'bun.lockb'] },
  { name: 'npm', files: ['package-lock.json', 'npm-shrinkwrap.json'] },
];

const KNOWN_MANAGERS = new Set(LOCKFILE_ORDER.map(({ name }) => name));
const PACKAGE_MANAGER_FIELD = /"packageManager"\s*:\s*"(?<name>[a-z]+)@(?<major>\d+)/u;
const BERRY_MAJOR = 2;

function readProjectText(projectRoot, name) {
  const file = containedPath(projectRoot, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function managerFromLockfile(projectRoot) {
  return LOCKFILE_ORDER.find(({ files }) =>
    files.some((file) => existsSync(containedPath(projectRoot, file))),
  )?.name;
}

function yarnFlavor(projectRoot, declaredMajor) {
  if (declaredMajor !== undefined) {
    return Number(declaredMajor) >= BERRY_MAJOR ? 'berry' : 'classic';
  }
  const isBerry =
    readProjectText(projectRoot, 'yarn.lock').includes('__metadata:') ||
    existsSync(containedPath(projectRoot, '.yarnrc.yml'));
  return isBerry ? 'berry' : 'classic';
}

export function detectPackageManager(projectRoot) {
  const declared = PACKAGE_MANAGER_FIELD.exec(readProjectText(projectRoot, 'package.json'))?.groups;
  const name = KNOWN_MANAGERS.has(declared?.name)
    ? declared.name
    : managerFromLockfile(projectRoot);
  if (name === undefined) {
    return { name: 'npm' };
  }
  const declaredMajor = declared?.name === 'yarn' ? declared.major : undefined;
  return name === 'yarn' ? { name, flavor: yarnFlavor(projectRoot, declaredMajor) } : { name };
}
