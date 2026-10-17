import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { resolveDependencyHook } from './dependency-hooks.mjs';
import { installFakeManagers } from './package-managers/test-support/fake-managers.mjs';

const { temporaryRoot } = useGitFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

function projectWith(files) {
  const root = temporaryRoot('dependency-hook-');
  writeFiles(root, { 'package.json': '{"name":"fixture"}\n', ...files });
  return root;
}

function useFakeManagers(names) {
  const binDirectory = installFakeManagers(temporaryRoot('fake-managers-'), names);
  vi.stubEnv('PATH', `${binDirectory}${path.delimiter}${process.env.PATH}`);
}

function recordedCall(projectRoot) {
  return JSON.parse(readFileSync(path.join(projectRoot, 'fake-install-call.json'), 'utf8'));
}

describe('dependency hook install', () => {
  it.each([
    [
      'npm',
      { 'package-lock.json': '{}' },
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
    ],
    [
      'pnpm',
      { 'pnpm-lock.yaml': '' },
      ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
    ],
    [
      'yarn',
      { 'yarn.lock': '# yarn lockfile v1\n' },
      ['install', '--frozen-lockfile', '--ignore-scripts', '--non-interactive', '--prefer-offline'],
    ],
    [
      'yarn',
      { 'yarn.lock': '__metadata:\n  version: 8\n' },
      ['install', '--immutable', '--mode=skip-build'],
    ],
    ['bun', { 'bun.lock': '' }, ['install', '--frozen-lockfile', '--ignore-scripts']],
  ])('runs the frozen install of %s with scripts disabled', (manager, files, args) => {
    useFakeManagers();
    const projectRoot = projectWith(files);

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(recordedCall(projectRoot)).toEqual({ manager, args });
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

  it('returns the dependency folders of workspace members', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'pnpm-lock.yaml': '',
      'packages/web/package.json': '{"name":"web"}\n',
      'packages/api/package.json': '{"name":"api"}\n',
      'fake-members.txt': 'packages/web\n',
    });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(dependencies.memberPaths).toEqual([path.join(projectRoot, 'packages/web/node_modules')]);
  });

  it('removes the partial install and reports the manager output on failure', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'pnpm-lock.yaml': '',
      'fake-failure.txt': 'ERR_PNPM_OUTDATED_LOCKFILE lockfile is not up to date\n',
    });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        'Failed to install merge-base dependencies with pnpm: ERR_PNPM_OUTDATED_LOCKFILE lockfile is not up to date',
      ),
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
      'Failed to install merge-base dependencies: this project uses pnpm, which is not installed. Run `corepack enable pnpm` (Corepack ships with Node.js) or `npm install --global pnpm`.',
    ],
    [
      'yarn',
      { 'yarn.lock': '' },
      'Failed to install merge-base dependencies: this project uses yarn, which is not installed. Run `corepack enable yarn` (Corepack ships with Node.js) or `npm install --global yarn`.',
    ],
    [
      'bun',
      { 'bun.lock': '' },
      'Failed to install merge-base dependencies: this project uses bun, which is not installed. Run `npm install --global bun` or see https://bun.sh/docs/installation.',
    ],
  ])('names the install command when %s is missing', (_manager, files, message) => {
    vi.stubEnv('PATH', temporaryRoot('empty-path-'));
    const projectRoot = projectWith(files);

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(new Error(message));
  });

  it('explains a successful install that left no dependency folder', () => {
    useFakeManagers();
    const projectRoot = projectWith({
      'yarn.lock': '__metadata:\n',
      'fake-no-dependencies.txt': '',
    });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        "Failed to install merge-base dependencies with yarn: the install created no node_modules folder (Yarn Plug'n'Play is not supported: set `nodeLinker: node-modules`).",
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
