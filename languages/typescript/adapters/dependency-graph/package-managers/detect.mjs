import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
const PACKAGE_MANAGER_FIELD = /^(?<name>[a-z]+)@(?<major>\d+)/u;

function readPackageManagerField(projectRoot) {
  try {
    const { packageManager } = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    );
    return PACKAGE_MANAGER_FIELD.exec(packageManager ?? '')?.groups;
  } catch {
    return undefined;
  }
}

function managerFromLockfile(projectRoot) {
  return LOCKFILE_ORDER.find(({ files }) =>
    files.some((file) => existsSync(path.join(projectRoot, file))),
  )?.name;
}

function isBerryLockfile(projectRoot) {
  try {
    return readFileSync(path.join(projectRoot, 'yarn.lock'), 'utf8').includes('__metadata:');
  } catch {
    return false;
  }
}

function yarnFlavor(projectRoot, declaredMajor) {
  if (declaredMajor !== undefined) {
    return Number(declaredMajor) >= 2 ? 'berry' : 'classic';
  }
  return isBerryLockfile(projectRoot) || existsSync(path.join(projectRoot, '.yarnrc.yml'))
    ? 'berry'
    : 'classic';
}

export function detectPackageManager(projectRoot) {
  const declared = readPackageManagerField(projectRoot);
  const name = KNOWN_MANAGERS.has(declared?.name)
    ? declared.name
    : managerFromLockfile(projectRoot);
  if (name === undefined) {
    return { name: 'npm' };
  }
  return name === 'yarn'
    ? {
        name,
        flavor: yarnFlavor(projectRoot, declared?.name === 'yarn' ? declared.major : undefined),
      }
    : { name };
}
