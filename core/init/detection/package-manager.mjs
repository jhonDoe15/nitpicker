import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { detectPackageManager as detectManager } from '../../../languages/typescript/adapters/dependency-graph/package-managers/detect.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { hasProjectFile, insideProject } from '../support/inside-project.mjs';

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
const NODE_LINKER = /^nodeLinker:[ \t]*["']?(?<linker>[\w-]+)/mu;
const PLUG_AND_PLAY = 'pnp';

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

function projectText(root, name) {
  return hasProjectFile(root, name) ? readFileSync(insideProject(root, name), 'utf8') : '';
}

function workspacePatterns(root, name) {
  if (name === 'pnpm') {
    const packages = parse(projectText(root, 'pnpm-workspace.yaml'))?.packages;
    return Array.isArray(packages) ? packages : [];
  }
  const workspaces = readManifest(root)?.workspaces;
  const patterns = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
  return Array.isArray(patterns) ? patterns : [];
}

function isWorkspaceMember(projectRoot, manager) {
  const relative = path.relative(manager.root, projectRoot).split(path.sep).join('/');
  if (relative === '') {
    return true;
  }
  const patterns = workspacePatterns(manager.root, manager.name)
    .filter((pattern) => typeof pattern === 'string')
    .map((pattern) => pattern.replace(/^\.\//u, '').replace(/\/+$/u, ''));
  const matching = (pattern) => globMatcher(pattern).test(relative);
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).some(matching);
  const excluded = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .some((pattern) => matching(pattern.slice(1)));
  return included && !excluded;
}

function rejectPlugAndPlay(manager) {
  const linker = NODE_LINKER.exec(projectText(manager.root, '.yarnrc.yml'))?.groups.linker;
  if (
    manager.name !== 'yarn' ||
    manager.major === 1 ||
    (linker ?? PLUG_AND_PLAY) !== PLUG_AND_PLAY
  ) {
    return;
  }
  throw new Error(
    `This project uses Yarn Plug'n'Play, which nitpicker does not support: it reads the packages from node_modules. Add the line \`nodeLinker: node-modules\` to ${path.join(manager.root, '.yarnrc.yml')}, run yarn install, and run nitpicker init again.`,
  );
}

export function describePackageManager(projectRoot) {
  const found = detectManager(projectRoot);
  const detected = isWorkspaceMember(projectRoot, found) ? found : { ...found, root: projectRoot };
  const locked = LOCKFILES[detected.name].some((file) => hasProjectFile(detected.root, file));
  const declaration = packageManagerDeclaration(projectRoot);
  const manager = (locked ? undefined : declaredManager(declaration)) ?? detected;
  rejectPlugAndPlay(manager);
  return {
    ...manager,
    locked,
    declaration,
    add: addCommand(projectRoot, manager),
    run: COMMANDS[manager.name].run,
  };
}
