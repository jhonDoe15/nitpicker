import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectPackageManager as detectManager } from '../../../languages/typescript/adapters/dependency-graph/package-managers/detect.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { hasProjectFile } from '../support/inside-project.mjs';

const COMMANDS = {
  npm: { add: 'npm install --save-dev', run: 'npx nitpicker' },
  pnpm: { add: 'pnpm add --save-dev', run: 'pnpm exec nitpicker' },
  yarn: { add: 'yarn add --dev', run: 'yarn nitpicker' },
  bun: { add: 'bun add --dev', run: 'bunx nitpicker' },
};
const LOCKFILES = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};
const DECLARED_MANAGER = /^(?<name>npm|pnpm|yarn|bun)@(?<major>\d+)?/u;
const BERRY_MAJOR = 3;

function searchDirectories(projectRoot) {
  const directories = ancestorDirectories(projectRoot);
  const top = directories.findIndex((directory) => existsSync(path.join(directory, '.git')));
  return top === -1 ? [projectRoot] : directories.slice(0, top + 1);
}

function packageManagerDeclaration(projectRoot) {
  const directory = searchDirectories(projectRoot).find(
    (candidate) => typeof readManifest(candidate)?.packageManager === 'string',
  );
  return directory === undefined
    ? undefined
    : { directory, field: readManifest(directory).packageManager };
}

function declaredManager(declaration) {
  const declared = DECLARED_MANAGER.exec(declaration?.field ?? '')?.groups;
  if (declared === undefined) {
    return undefined;
  }
  const major = declared.major === undefined ? BERRY_MAJOR : Number(declared.major);
  const manager = { name: declared.name, root: declaration.directory };
  return declared.name === 'yarn' ? { ...manager, major } : manager;
}

function isWorkspaceRoot(projectRoot, name) {
  return name === 'pnpm'
    ? hasProjectFile(projectRoot, 'pnpm-workspace.yaml')
    : readManifest(projectRoot)?.workspaces !== undefined;
}

function addCommand(projectRoot, manager) {
  const add = COMMANDS[manager.name].add;
  if (!isWorkspaceRoot(projectRoot, manager.name)) {
    return add;
  }
  if (manager.name === 'pnpm') {
    return `${add} -w`;
  }
  return manager.name === 'yarn' && manager.major === 1 ? `${add} -W` : add;
}

export function describePackageManager(projectRoot) {
  const detected = detectManager(projectRoot);
  const locked = LOCKFILES[detected.name].some((file) => hasProjectFile(detected.root, file));
  const declaration = packageManagerDeclaration(projectRoot);
  const manager = (locked ? undefined : declaredManager(declaration)) ?? detected;
  return {
    ...manager,
    locked,
    declaration,
    add: addCommand(projectRoot, manager),
    run: COMMANDS[manager.name].run,
  };
}
