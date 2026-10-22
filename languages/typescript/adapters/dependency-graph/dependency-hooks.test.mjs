import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { resolveDependencyHook } from './dependency-hooks.mjs';
import { installDependencies } from './package-managers/install.mjs';
import {
  installFakeManagers,
  installOnlyEnv,
} from './package-managers/test-support/fake-managers.mjs';

const git = useGitFixtures();
const { temporaryRoot } = git;

afterEach(() => {
  vi.unstubAllEnvs();
});

function projectWith(files) {
  const root = temporaryRoot('dependency-hook-');
  writeFiles(root, { 'package.json': '{"name":"fixture"}\n', ...files });
  return root;
}

function repositoryWith(files) {
  return git.createGitRepository({ 'package.json': '{"name":"fixture"}\n', ...files }).root;
}

function useFakeManagers() {
  const binDirectory = installFakeManagers(temporaryRoot('fake-managers-'));
  vi.stubEnv('PATH', `${binDirectory}${path.delimiter}${process.env.PATH}`);
}

function recordedCall(projectRoot) {
  return JSON.parse(readFileSync(path.join(projectRoot, 'fake-install-call.json'), 'utf8'));
}

const BERRY_LOCKFILE = '__metadata:\n  version: 8\n';
const IGNORED_PATH = { COREPACK_ENABLE_AUTO_PIN: '0', YARN_IGNORE_PATH: null };
const YARN_IGNORED_PATH = { COREPACK_ENABLE_AUTO_PIN: '0', YARN_IGNORE_PATH: '1' };

describe('dependency hook install', () => {
  it.each([
    [
      'npm',
      { 'package-lock.json': '{}' },
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
      IGNORED_PATH,
    ],
    [
      'pnpm',
      { 'pnpm-lock.yaml': '' },
      ['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile', '--prefer-offline'],
      IGNORED_PATH,
    ],
    [
      'yarn',
      { 'yarn.lock': '# yarn lockfile v1\n' },
      ['install', '--frozen-lockfile', '--ignore-scripts', '--non-interactive', '--prefer-offline'],
      YARN_IGNORED_PATH,
    ],
    [
      'yarn',
      { 'yarn.lock': '__metadata:\n  version: 4\n' },
      ['install', '--immutable', '--skip-builds'],
      YARN_IGNORED_PATH,
    ],
    [
      'yarn',
      { 'yarn.lock': BERRY_LOCKFILE },
      ['install', '--immutable', '--mode=skip-build'],
      YARN_IGNORED_PATH,
    ],
    ['bun', { 'bun.lock': '' }, ['install', '--frozen-lockfile', '--ignore-scripts'], IGNORED_PATH],
  ])('runs the frozen install of %s with scripts disabled', (manager, files, args, environment) => {
    useFakeManagers();
    const projectRoot = projectWith(files);

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(recordedCall(projectRoot)).toEqual({ manager, args, environment });
    expect(dependencies).toEqual({
      kind: 'installed',
      dependencyPath: path.join(projectRoot, 'node_modules'),
      memberPaths: [],
    });
  });

  it('installs with the manager named by the packageManager field', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'package.json': '{"name":"fixture","packageManager":"pnpm@9.1.0"}\n',
      'package-lock.json': '{}',
    });

    resolveDependencyHook().install(projectRoot);

    expect(recordedCall(projectRoot).manager).toBe('pnpm');
  });

  it('installs a workspace member from the folder that holds the lockfile', () => {
    useFakeManagers();
    const repository = repositoryWith({
      'pnpm-lock.yaml': '',
      'packages/app/package.json': '{"name":"app"}\n',
    });
    const member = path.join(repository, 'packages/app');

    const dependencies = resolveDependencyHook().install(member);

    expect(recordedCall(repository).manager).toBe('pnpm');
    expect(existsSync(path.join(member, 'fake-install-call.json'))).toBe(false);
    expect(dependencies).toEqual({
      kind: 'installed',
      dependencyPath: path.join(repository, 'node_modules'),
      memberPaths: [],
    });
  });

  it('returns only the dependency folders of workspace members the install created', () => {
    useFakeManagers();
    const projectRoot = repositoryWith({
      'pnpm-lock.yaml': '',
      'packages/web/package.json': '{"name":"web"}\n',
      'packages/api/package.json': '{"name":"api"}\n',
      'packages/old/package.json': '{"name":"old"}\n',
      'packages/old/node_modules/kept/index.json': '{}\n',
      'fake-members.txt': 'packages/web\n',
    });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(dependencies.memberPaths).toEqual([path.join(projectRoot, 'packages/web/node_modules')]);
  });

  it('removes the partial install and reports the manager output on failure', () => {
    useFakeManagers();
    const projectRoot = repositoryWith({
      'pnpm-lock.yaml': '',
      'packages/web/package.json': '{"name":"web"}\n',
      'fake-members.txt': 'packages/web\n',
      'fake-failure.txt': 'ERR_PNPM_OUTDATED_LOCKFILE lockfile is not up to date\n',
    });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        'Failed to install merge-base dependencies with pnpm: ERR_PNPM_OUTDATED_LOCKFILE lockfile is not up to date',
      ),
    );
    expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
  });

  it('names the signal that stopped the install', () => {
    useFakeManagers();
    const projectRoot = projectWith({ 'bun.lock': '', 'fake-signal.txt': '' });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error('Failed to install merge-base dependencies with bun: stopped by SIGKILL'),
    );
    expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
  });

  it.each([
    [
      'npm',
      { 'package-lock.json': '{}' },
      'Failed to install merge-base dependencies: this project uses npm, which is not installed. Install Node.js, which includes npm.',
    ],
    [
      'pnpm',
      { 'pnpm-lock.yaml': '' },
      'Failed to install merge-base dependencies: this project uses pnpm, which is not installed. Run `npm install --global corepack && corepack enable pnpm` or `npm install --global pnpm`.',
    ],
    [
      'yarn',
      { 'yarn.lock': '' },
      'Failed to install merge-base dependencies: this project uses yarn, which is not installed. Run `npm install --global corepack && corepack enable yarn` or `npm install --global yarn`.',
    ],
    [
      'bun',
      { 'bun.lock': '' },
      'Failed to install merge-base dependencies: this project uses bun, which is not installed. Run `npm install --global bun` or see https://bun.sh/docs/installation.',
    ],
  ])('names the install command when %s is missing', (_manager, files, message) => {
    vi.stubEnv('PATH', installOnlyEnv(temporaryRoot('only-env-')));
    const projectRoot = projectWith(files);

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(new Error(message));
  });

  it('explains a Yarn 2 install that left no dependency folder', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'yarn.lock': BERRY_LOCKFILE,
      'fake-no-dependencies.txt': '',
    });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        "Failed to install merge-base dependencies with yarn: the install created no node_modules folder (Yarn Plug'n'Play is not supported: set `nodeLinker: node-modules`)",
      ),
    );
  });

  it.each([
    ['npm', { 'package-lock.json': '{}' }],
    ['pnpm', { 'pnpm-lock.yaml': '' }],
    ['bun', { 'bun.lock': '' }],
  ])('accepts a %s project that has no dependencies to install', (_manager, files) => {
    useFakeManagers();
    const projectRoot = projectWith({ ...files, 'fake-no-dependencies.txt': '' });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(dependencies).toEqual({
      kind: 'installed',
      dependencyPath: path.join(projectRoot, 'node_modules'),
      memberPaths: [],
    });
    expect(existsSync(dependencies.dependencyPath)).toBe(true);
  });

  it('refuses a base whose .yarnrc.yml lists Yarn plugins and runs nothing', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'yarn.lock': BERRY_LOCKFILE,
      '.yarnrc.yml': 'nodeLinker: node-modules\nplugins:\n  - path: .yarn/plugins/local.cjs\n',
    });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        "Failed to install merge-base dependencies: the base's .yarnrc.yml lists Yarn plugins, which are JavaScript files that Yarn runs during an install, and nitpicker does not run repository code there. Remove the plugins from the base, or make its package.json and lockfile equal to the head's so that no install is needed.",
      ),
    );
    expect(existsSync(path.join(projectRoot, 'fake-install-call.json'))).toBe(false);
  });

  it('does not install on native Windows', () => {
    expect(() => installDependencies({ name: 'npm', root: '/project' }, 'win32')).toThrow(
      new Error(
        "Failed to install merge-base dependencies: installing the base dependencies is not supported on native Windows (Node refuses to start the package managers' .cmd shims without a shell). Run nitpicker in WSL.",
      ),
    );
  });

  it('refuses to replace an existing dependency folder', () => {
    useFakeManagers();
    const projectRoot = projectWith({ 'pnpm-lock.yaml': '' });
    mkdirSync(path.join(projectRoot, 'node_modules'));

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        `Refusing to replace existing dependencies at ${path.join(projectRoot, 'node_modules')}`,
      ),
    );
  });
});
