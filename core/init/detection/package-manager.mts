import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { detectPackageManager as detectManager } from '../../../languages/typescript/adapters/dependency-graph/package-managers/detect.mjs';
import { readManifest } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { hasProjectFile, insideProject } from '../support/inside-project.mts';
import type { NodeManager } from '../init-types.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type Manager = {
  readonly name: string | undefined;
  readonly root: string;
  readonly major?: number;
};

type Declaration = { readonly directory: string; readonly field: unknown };

type Commands = { readonly add: string; readonly install: string; readonly run: string };

const managerIn: (projectRoot: string) => Manager = detectManager;
const manifestOf: (projectRoot: string) => unknown = readManifest;
const ancestorsOf: (directory: string) => string[] = ancestorDirectories;
const matcherOf: (glob: string) => { readonly test: (relative: string) => boolean } = globMatcher;
const loadModule: (id: string) => { readonly parse: (text: string) => unknown } = createRequire(
  import.meta.url,
);

const COMMANDS: Readonly<Record<string, Commands>> = {
  npm: { add: 'npm install --save-dev', install: 'npm install', run: 'npx nitpicker' },
  pnpm: { add: 'pnpm add --save-dev', install: 'pnpm install', run: 'pnpm exec nitpicker' },
  yarn: { add: 'yarn add --dev', install: 'yarn install', run: 'yarn nitpicker' },
  bun: { add: 'bun add --dev', install: 'bun install', run: 'bunx nitpicker' },
};
const LOCKFILES: Readonly<Record<string, readonly string[]>> = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};
const DECLARED_MANAGER = /^(?<name>npm|pnpm|yarn|bun)@(?<major>\d+)?/u;
const BERRY_MAJOR = 3;
const NODE_LINKER = /^nodeLinker:[ \t]*["']?(?<linker>[\w-]+)/mu;
const PLUG_AND_PLAY = 'pnp';

function commandsOf(name: string | undefined): Commands {
  const commands = COMMANDS[textOf(name)];
  if (commands === undefined) {
    throw new TypeError(`Unknown package manager: ${textOf(name)}`);
  }
  return commands;
}

function searchDirectories(projectRoot: string): string[] {
  const directories = ancestorsOf(projectRoot);
  const top = directories.findIndex((directory) => existsSync(path.join(directory, '.git')));
  return top === -1 ? [projectRoot] : directories.slice(0, top + 1);
}

function packageManagerDeclaration(projectRoot: string): Declaration | undefined {
  const directory = searchDirectories(projectRoot).find(
    (candidate) => typeof fieldOf(manifestOf(candidate), 'packageManager') === 'string',
  );
  return directory === undefined
    ? undefined
    : { directory, field: fieldOf(manifestOf(directory), 'packageManager') };
}

function declaredManager(declaration: Declaration | undefined): Manager | undefined {
  const declared =
    declaration === undefined
      ? undefined
      : DECLARED_MANAGER.exec(textOf(declaration.field))?.groups;
  if (declaration === undefined || declared === undefined) {
    return undefined;
  }
  const major = declared['major'] === undefined ? BERRY_MAJOR : Number(declared['major']);
  const manager = { name: declared['name'], root: declaration.directory };
  return declared['name'] === 'yarn' ? { ...manager, major } : manager;
}

function isWorkspaceRoot(projectRoot: string, name: string | undefined): boolean {
  return name === 'pnpm'
    ? hasProjectFile(projectRoot, 'pnpm-workspace.yaml')
    : fieldOf(manifestOf(projectRoot), 'workspaces') !== undefined;
}

function addCommand(projectRoot: string, manager: Manager): string {
  const add = commandsOf(manager.name).add;
  if (!isWorkspaceRoot(projectRoot, manager.name)) {
    return add;
  }
  if (manager.name === 'pnpm') {
    return `${add} -w`;
  }
  return manager.name === 'yarn' && manager.major === 1 ? `${add} -W` : add;
}

function projectText(root: string, name: string): string {
  return hasProjectFile(root, name) ? readFileSync(insideProject(root, name), 'utf8') : '';
}

function workspacePatterns(root: string, name: string | undefined): readonly unknown[] {
  if (name === 'pnpm') {
    const { parse } = loadModule('yaml');
    const packages = fieldOf(parse(projectText(root, 'pnpm-workspace.yaml')), 'packages');
    return Array.isArray(packages) ? packages : [];
  }
  const workspaces = fieldOf(manifestOf(root), 'workspaces');
  const patterns = Array.isArray(workspaces) ? workspaces : fieldOf(workspaces, 'packages');
  return Array.isArray(patterns) ? patterns : [];
}

function isWorkspaceMember(projectRoot: string, manager: Manager): boolean {
  const relative = path.relative(manager.root, projectRoot).split(path.sep).join('/');
  if (relative === '') {
    return true;
  }
  const patterns = workspacePatterns(manager.root, manager.name)
    .filter((pattern) => typeof pattern === 'string')
    .map((pattern) => pattern.replace(/^\.\//u, '').replace(/\/+$/u, ''));
  const included = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .some((pattern) => matcherOf(pattern).test(relative));
  const excluded = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .some((pattern) => matcherOf(pattern.slice(1)).test(relative));
  return included && !excluded;
}

function rejectPlugAndPlay(manager: Manager): void {
  const linker = NODE_LINKER.exec(projectText(manager.root, '.yarnrc.yml'))?.groups?.['linker'];
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

export function describePackageManager(projectRoot: string): NodeManager {
  const found = managerIn(projectRoot);
  const detected = isWorkspaceMember(projectRoot, found) ? found : { ...found, root: projectRoot };
  const locked = (LOCKFILES[textOf(detected.name)] ?? []).some((file) =>
    hasProjectFile(detected.root, file),
  );
  const declaration = packageManagerDeclaration(projectRoot);
  const manager = (locked ? undefined : declaredManager(declaration)) ?? detected;
  rejectPlugAndPlay(manager);
  return {
    ...manager,
    locked,
    declaration,
    add: addCommand(projectRoot, manager),
    install: commandsOf(manager.name).install,
    run: commandsOf(manager.name).run,
  };
}
