import { existsSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { hasProjectFile } from '../support/inside-project.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';

export const PACKAGE_MANAGERS = {
  npm: { name: 'npm', add: 'npm install --save-dev', run: 'npx nitpicker' },
  pnpm: { name: 'pnpm', add: 'pnpm add --save-dev', run: 'pnpm exec nitpicker' },
  yarn: { name: 'yarn', add: 'yarn add --dev', run: 'yarn nitpicker' },
  bun: { name: 'bun', add: 'bun add --dev', run: 'bunx nitpicker' },
};

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];
const PACKAGE_MANAGER_FIELD = /^(npm|pnpm|yarn|bun)@/u;

function searchDirectories(projectRoot) {
  const directories = ancestorDirectories(projectRoot);
  const top = directories.findIndex((directory) => existsSync(path.join(directory, '.git')));
  return top === -1 ? [projectRoot] : directories.slice(0, top + 1);
}

function declaredManager(directory) {
  return PACKAGE_MANAGER_FIELD.exec(String(readManifest(directory)?.packageManager))?.[1];
}

function lockedManager(directory) {
  return LOCKFILES.find(([file]) => hasProjectFile(directory, file))?.[1];
}

export function detectPackageManager(projectRoot) {
  const name = searchDirectories(projectRoot)
    .map((directory) => declaredManager(directory) ?? lockedManager(directory))
    .find((found) => found !== undefined);
  return PACKAGE_MANAGERS[name ?? 'npm'];
}
