import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { detectPackageManager, managerRoot } from './detect.mjs';

const { temporaryRoot } = useGitFixtures();

function projectWith(files) {
  const root = temporaryRoot('package-manager-detect-');
  writeFiles(root, files);
  return root;
}

const manifest = (packageManager) =>
  `${JSON.stringify({ name: 'fixture', ...(packageManager && { packageManager }) })}\n`;

const BERRY_LOCKFILE = '__metadata:\n  version: 8\n';

describe('package manager detection', () => {
  it.each([
    ['no manager hint', { 'package.json': manifest() }, { name: 'npm' }],
    [
      'package-lock.json',
      { 'package.json': manifest(), 'package-lock.json': '{}' },
      { name: 'npm' },
    ],
    [
      'npm-shrinkwrap.json',
      { 'package.json': manifest(), 'npm-shrinkwrap.json': '{}' },
      { name: 'npm' },
    ],
    ['pnpm-lock.yaml', { 'package.json': manifest(), 'pnpm-lock.yaml': '' }, { name: 'pnpm' }],
    ['bun.lock', { 'package.json': manifest(), 'bun.lock': '' }, { name: 'bun' }],
    ['bun.lockb', { 'package.json': manifest(), 'bun.lockb': '' }, { name: 'bun' }],
    [
      'a classic yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': '# yarn lockfile v1\n' },
      { name: 'yarn', major: 1 },
    ],
    [
      'a Yarn 4 yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': BERRY_LOCKFILE },
      { name: 'yarn', major: 3 },
    ],
    [
      'a Yarn 2 yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': '__metadata:\n  version: 4\n' },
      { name: 'yarn', major: 2 },
    ],
    [
      'a .yarnrc.yml next to an empty yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': '', '.yarnrc.yml': 'nodeLinker: node-modules\n' },
      { name: 'yarn', major: 3 },
    ],
    [
      'the header of a classic yarn.lock over a .yarnrc.yml',
      {
        'package.json': manifest(),
        'yarn.lock': '# yarn lockfile v1\n',
        '.yarnrc.yml': 'nodeLinker: node-modules\n',
      },
      { name: 'yarn', major: 1 },
    ],
    [
      'the packageManager field over a lockfile',
      { 'package.json': manifest('pnpm@9.1.0+sha512.abc'), 'package-lock.json': '{}' },
      { name: 'pnpm' },
    ],
    [
      'the packageManager field without a lockfile',
      { 'package.json': manifest('bun@1.1.0') },
      { name: 'bun' },
    ],
    [
      'a yarn 1 packageManager field over a berry lockfile',
      { 'package.json': manifest('yarn@1.22.22'), 'yarn.lock': BERRY_LOCKFILE },
      { name: 'yarn', major: 1 },
    ],
    [
      'a yarn 2 packageManager field',
      { 'package.json': manifest('yarn@2.4.3'), 'yarn.lock': '# yarn lockfile v1\n' },
      { name: 'yarn', major: 2 },
    ],
    [
      'a yarn 4 packageManager field',
      { 'package.json': manifest('yarn@4.9.2'), 'yarn.lock': '# yarn lockfile v1\n' },
      { name: 'yarn', major: 4 },
    ],
    [
      'the yarn@berry packageManager field',
      { 'package.json': manifest('yarn@berry') },
      { name: 'yarn', major: 3 },
    ],
    [
      'a ranged packageManager field',
      { 'package.json': manifest('pnpm@^9.0.0'), 'yarn.lock': '' },
      { name: 'pnpm' },
    ],
    [
      'an unknown packageManager name falls back to the lockfile',
      { 'package.json': manifest('deno@2.0.0'), 'pnpm-lock.yaml': '' },
      { name: 'pnpm' },
    ],
    [
      'several lockfiles prefer pnpm, then yarn, then bun, then npm',
      { 'package.json': manifest(), 'package-lock.json': '{}', 'bun.lock': '', 'yarn.lock': '' },
      { name: 'yarn', major: 1 },
    ],
    [
      'a malformed package.json falls back to the text of the field',
      { 'package.json': '{ "packageManager": "bun@1.1.0",', 'pnpm-lock.yaml': '' },
      { name: 'bun' },
    ],
    [
      'a packageManager key nested in another object is not the field',
      {
        'package.json': '{"config":{"packageManager":"bun@1.1.0"}}\n',
        'pnpm-lock.yaml': '',
      },
      { name: 'pnpm' },
    ],
  ])('detects the manager from %s', (_label, files, expected) => {
    const root = projectWith(files);

    expect(detectPackageManager(root)).toEqual({ ...expected, root });
  });
});

describe('workspace root lookup', () => {
  function workspaceWith(files) {
    const repository = projectWith({ ...files, '.git/HEAD': 'ref: refs/heads/main\n' });
    const member = path.join(repository, 'packages/app');
    mkdirSync(member, { recursive: true });
    writeFiles(member, { 'package.json': manifest() });
    return { repository, member };
  }

  it('finds the manager and the lockfile above a project inside a repository', () => {
    const { repository, member } = workspaceWith({
      'package.json': manifest('pnpm@9.1.0'),
      'pnpm-lock.yaml': '',
    });

    expect(detectPackageManager(member)).toEqual({ name: 'pnpm', root: repository });
    expect(managerRoot(member)).toBe(repository);
  });

  it('prefers the nearest lockfile', () => {
    const { member } = workspaceWith({ 'package.json': manifest(), 'pnpm-lock.yaml': '' });
    writeFiles(member, { 'yarn.lock': '# yarn lockfile v1\n' });

    expect(detectPackageManager(member)).toEqual({ name: 'yarn', root: member, major: 1 });
  });

  it('does not leave a directory that is not inside a repository', () => {
    const outer = projectWith({ 'package.json': manifest(), 'pnpm-lock.yaml': '' });
    const inner = path.join(outer, 'packages/app');
    mkdirSync(inner, { recursive: true });
    writeFiles(inner, { 'package.json': manifest() });

    expect(managerRoot(inner)).toBe(inner);
  });

  it('stops at the repository root', () => {
    const outer = projectWith({ 'package.json': manifest(), 'pnpm-lock.yaml': '' });
    const repository = path.join(outer, 'repo');
    const member = path.join(repository, 'packages/app');
    mkdirSync(member, { recursive: true });
    writeFiles(repository, { '.git/HEAD': 'ref: refs/heads/main\n' });

    expect(managerRoot(member)).toBe(member);
  });
});
