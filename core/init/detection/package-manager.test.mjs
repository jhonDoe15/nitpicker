import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { detectPackageManager, PACKAGE_MANAGERS } from './package-manager.mjs';

const project = useProjects();

describe('package manager detection', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
  ])('reads %s as %s', (lockfile, name) => {
    const root = project({ 'package.json': '{}', [lockfile]: '' });

    expect(detectPackageManager(root)).toBe(PACKAGE_MANAGERS[name]);
  });

  it.each(['npm', 'pnpm', 'yarn', 'bun'])('reads packageManager %s over a lockfile', (name) => {
    const root = project({
      'package.json': JSON.stringify({ packageManager: `${name}@1.2.3` }),
      'package-lock.json': name === 'npm' ? '' : '{}',
      'yarn.lock': name === 'npm' ? '{}' : '',
    });

    expect(detectPackageManager(root)).toBe(PACKAGE_MANAGERS[name]);
  });

  it('falls back to npm when nothing says otherwise', () => {
    const root = project({ 'package.json': '{"packageManager":"deno@2"}' });

    expect(detectPackageManager(root)).toBe(PACKAGE_MANAGERS.npm);
  });

  it('reads the lockfile of a workspace root above the project, up to the repository root', () => {
    const root = project({ 'pnpm-lock.yaml': '', 'web/package.json': '{}' }, { repository: true });

    expect(detectPackageManager(`${root}/web`)).toBe(PACKAGE_MANAGERS.pnpm);
  });

  it('does not look above the project when there is no repository', () => {
    const root = project({ 'pnpm-lock.yaml': '', 'web/package.json': '{}' });

    expect(detectPackageManager(`${root}/web`)).toBe(PACKAGE_MANAGERS.npm);
  });

  it('prefers the nearest declaration', () => {
    const root = project(
      { 'yarn.lock': '', 'web/package.json': '{"packageManager":"bun@1.1.0"}' },
      { repository: true },
    );

    expect(detectPackageManager(`${root}/web`)).toBe(PACKAGE_MANAGERS.bun);
  });

  it('gives each manager its add and run commands', () => {
    expect(Object.values(PACKAGE_MANAGERS).map(({ add, run }) => [add, run])).toEqual([
      ['npm install --save-dev', 'npx nitpicker'],
      ['pnpm add --save-dev', 'pnpm exec nitpicker'],
      ['yarn add --dev', 'yarn nitpicker'],
      ['bun add --dev', 'bunx nitpicker'],
    ]);
  });
});
