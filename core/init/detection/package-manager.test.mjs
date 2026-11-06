import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { describePackageManager } from './package-manager.mjs';

const project = useProjects();
const NODE_MODULES_LINKER = 'nodeLinker: node-modules\n';
const COMMANDS = {
  npm: { add: 'npm install --save-dev', run: 'npx nitpicker' },
  pnpm: { add: 'pnpm add --save-dev', run: 'pnpm exec nitpicker' },
  yarn: { add: 'yarn add --dev', run: 'yarn nitpicker' },
  bun: { add: 'bun add --dev', run: 'bunx nitpicker' },
};

function manager(root, name, details = {}) {
  return { name, root, locked: false, declaration: undefined, ...COMMANDS[name], ...details };
}

describe('package manager detection', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm', {}],
    ['bun.lock', 'bun', {}],
    ['bun.lockb', 'bun', {}],
    ['package-lock.json', 'npm', {}],
    ['npm-shrinkwrap.json', 'npm', {}],
    ['yarn.lock', 'yarn', { major: 1 }],
  ])('reads %s as %s with a lockfile', (lockfile, name, details) => {
    const root = project({ 'package.json': '{}', [lockfile]: '' });

    expect(describePackageManager(root)).toEqual(manager(root, name, { ...details, locked: true }));
  });

  it('falls back to npm without a lockfile', () => {
    const root = project({ 'package.json': '{"packageManager":"deno@2"}' });

    expect(describePackageManager(root)).toEqual(
      manager(root, 'npm', { declaration: { directory: root, field: 'deno@2' } }),
    );
  });

  it('reads the packageManager field over the lockfile, with the Yarn major', () => {
    const field = 'yarn@4.5.0';
    const root = project({
      'package.json': JSON.stringify({ packageManager: field }),
      'yarn.lock': '',
      '.yarnrc.yml': NODE_MODULES_LINKER,
    });

    expect(describePackageManager(root)).toEqual(
      manager(root, 'yarn', { major: 4, locked: true, declaration: { directory: root, field } }),
    );
  });

  it.each([
    ['no .yarnrc.yml', {}],
    ['nodeLinker: pnp', { '.yarnrc.yml': 'nodeLinker: "pnp"\n' }],
  ])("refuses Yarn Plug'n'Play, with %s", (_name, files) => {
    const root = project({
      'package.json': JSON.stringify({ packageManager: 'yarn@4.5.0' }),
      'yarn.lock': '',
      ...files,
    });

    expect(() => describePackageManager(root)).toThrow(
      `This project uses Yarn Plug'n'Play, which nitpicker does not support: it reads the packages from node_modules. Add the line \`nodeLinker: node-modules\` to ${root}/.yarnrc.yml, run yarn install, and run nitpicker init again.`,
    );
  });

  it('reads the lockfile of a workspace root above the project, up to the repository root', () => {
    const root = project(
      {
        'pnpm-lock.yaml': '',
        'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
        'apps/web/package.json': '{}',
      },
      { repository: true },
    );

    expect(describePackageManager(`${root}/apps/web`)).toEqual(
      manager(root, 'pnpm', { locked: true }),
    );
  });

  it.each([
    ['no workspaces', { 'package.json': '{}' }],
    ['workspaces that leave it out', { 'package.json': '{"workspaces":["apps/*","!apps/web"]}' }],
  ])('takes a folder below a lockfile, with %s, as a project of its own', (_name, files) => {
    const root = project(
      { ...files, 'package-lock.json': '{}', 'apps/web/package.json': '{}' },
      { repository: true },
    );

    expect(describePackageManager(`${root}/apps/web`)).toEqual(manager(`${root}/apps/web`, 'npm'));
  });

  it('takes the declaration of an ancestor when no lockfile exists yet', () => {
    const field = 'pnpm@9.1.0';
    const root = project(
      { 'package.json': JSON.stringify({ packageManager: field }), 'web/package.json': '{}' },
      { repository: true },
    );
    const declaration = { directory: root, field };

    expect(describePackageManager(`${root}/web`)).toEqual({
      ...manager(root, 'pnpm', { declaration }),
    });
  });

  it('does not look above the project when there is no repository', () => {
    const root = project({
      'package.json': '{"packageManager":"bun@1.1.0"}',
      'web/package.json': '{}',
    });

    expect(describePackageManager(`${root}/web`)).toEqual(manager(`${root}/web`, 'npm'));
  });
});

describe('the install command at a workspace root', () => {
  it('adds -w for pnpm and -W for Yarn 1, which refuse to add to the root without it', () => {
    const pnpm = project({ 'package.json': '{}', 'pnpm-workspace.yaml': '', 'pnpm-lock.yaml': '' });
    const workspaces = JSON.stringify({ workspaces: ['packages/*'] });
    const yarn = project({ 'package.json': workspaces, 'yarn.lock': '' });

    expect(describePackageManager(pnpm).add).toBe('pnpm add --save-dev -w');
    expect(describePackageManager(yarn).add).toBe('yarn add --dev -W');
  });

  it('leaves npm, Bun and Yarn 2 or newer as they are, which add to the root', () => {
    const workspaces = { workspaces: ['packages/*'] };
    const npm = project({ 'package.json': JSON.stringify(workspaces) });
    const bun = project({ 'package.json': JSON.stringify(workspaces), 'bun.lock': '' });
    const berry = project({
      'package.json': JSON.stringify({ ...workspaces, packageManager: 'yarn@4.5.0' }),
      '.yarnrc.yml': NODE_MODULES_LINKER,
    });

    expect(describePackageManager(npm).add).toBe('npm install --save-dev');
    expect(describePackageManager(bun).add).toBe('bun add --dev');
    expect(describePackageManager(berry).add).toBe('yarn add --dev');
  });

  it('adds no flag in a workspace member', () => {
    const root = project(
      { 'pnpm-workspace.yaml': '', 'pnpm-lock.yaml': '', 'web/package.json': '{}' },
      { repository: true },
    );

    expect(describePackageManager(`${root}/web`).add).toBe('pnpm add --save-dev');
  });
});
