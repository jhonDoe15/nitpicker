import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { detectPackageManager } from './detect.mjs';

const { temporaryRoot } = useGitFixtures();

function detect(files) {
  const root = temporaryRoot('package-manager-detect-');
  writeFiles(root, files);
  return detectPackageManager(root);
}

const manifest = (packageManager) =>
  `${JSON.stringify({ name: 'fixture', ...(packageManager && { packageManager }) })}\n`;

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
      { name: 'yarn', flavor: 'classic' },
    ],
    [
      'a berry yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': '__metadata:\n  version: 8\n' },
      { name: 'yarn', flavor: 'berry' },
    ],
    [
      'a .yarnrc.yml next to a yarn.lock',
      { 'package.json': manifest(), 'yarn.lock': '', '.yarnrc.yml': 'nodeLinker: node-modules\n' },
      { name: 'yarn', flavor: 'berry' },
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
      { 'package.json': manifest('yarn@1.22.22'), 'yarn.lock': '__metadata:\n' },
      { name: 'yarn', flavor: 'classic' },
    ],
    [
      'a yarn 4 packageManager field over a classic lockfile',
      { 'package.json': manifest('yarn@4.9.2'), 'yarn.lock': '# yarn lockfile v1\n' },
      { name: 'yarn', flavor: 'berry' },
    ],
    [
      'an unknown packageManager name falls back to the lockfile',
      { 'package.json': manifest('deno@2.0.0'), 'pnpm-lock.yaml': '' },
      { name: 'pnpm' },
    ],
    [
      'several lockfiles prefer pnpm, then yarn, then bun, then npm',
      { 'package.json': manifest(), 'package-lock.json': '{}', 'bun.lock': '', 'yarn.lock': '' },
      { name: 'yarn', flavor: 'classic' },
    ],
    ['an unreadable package.json', { 'package.json': '{', 'pnpm-lock.yaml': '' }, { name: 'pnpm' }],
  ])('detects the manager from %s', (_label, files, expected) => {
    expect(detect(files)).toEqual(expected);
  });
});
