import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scratchTrees } from '../../../../../shared/test-support/scratch-trees.mts';
import { holdsProgram, programReachRoots, workspaceDependencyFolders } from './workspace-reach.mts';

const repository = scratchTrees('nitpicker-workspace-reach-');

function manifest(name: string, dependencies: Record<string, string> = {}): string {
  return JSON.stringify({ name, dependencies });
}

function linked(root: string, name: string, target: string): void {
  const link = path.join(root, 'node_modules', name);
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(path.join(root, target), link, 'dir');
}

function relative(root: string, folders: readonly string[]): string[] {
  return folders.map((folder) => path.relative(root, folder).split(path.sep).join('/')).toSorted();
}

describe('the workspace packages a project program reaches', () => {
  it('follows installed workspace dependencies, transitively, and skips registry packages', () => {
    const root = repository({
      'apps/web/package.json': manifest('web', { '@org/ui': '*', react: '18' }),
      'apps/web/tsconfig.json': '{}',
      'packages/ui/package.json': manifest('@org/ui', { '@org/lib': '*' }),
      'packages/lib/package.json': manifest('@org/lib'),
      'packages/unused/package.json': manifest('@org/unused'),
      'node_modules/react/package.json': manifest('react'),
    });
    linked(root, '@org/ui', 'packages/ui');
    linked(root, '@org/lib', 'packages/lib');
    linked(root, '@org/unused', 'packages/unused');

    expect(relative(root, workspaceDependencyFolders(path.join(root, 'apps/web')))).toEqual([
      'apps/web',
      'packages/lib',
      'packages/ui',
    ]);
    expect(relative(root, programReachRoots(path.join(root, 'apps/web')))).toEqual([
      'apps/web',
      'packages/lib',
      'packages/ui',
    ]);
  });

  it('leaves out folders that hold the project, folders outside the repository and library dev tools', () => {
    const root = repository({
      '.git/HEAD': '',
      'package.json': manifest('root'),
      'apps/web/package.json': manifest('web', { '@org/ui': '*', outside: '*' }),
      'packages/ui/package.json': JSON.stringify({
        name: '@org/ui',
        dependencies: { root: '*' },
        devDependencies: { '@org/lint': '*' },
      }),
      'packages/lint/package.json': manifest('@org/lint'),
    });
    linked(root, '@org/ui', 'packages/ui');
    linked(root, '@org/lint', 'packages/lint');
    linked(root, 'root', '.');
    linked(root, 'outside', '..');

    expect(relative(root, programReachRoots(path.join(root, 'apps/web')))).toEqual([
      'apps/web',
      'packages/ui',
    ]);
  });

  it('reaches only the project when it is missing or names a dependency outside the dependency folder', () => {
    const root = repository({
      'apps/web/package.json': manifest('web', { '../../packages/ui': '*' }),
      'packages/ui/package.json': manifest('@org/ui'),
    });
    const missing = path.join(root, 'apps/missing');

    expect(workspaceDependencyFolders(missing)).toEqual([missing]);
    expect(relative(root, workspaceDependencyFolders(path.join(root, 'apps/web')))).toEqual([
      'apps/web',
    ]);
  });

  it('holds a program when the project or a covering ancestor has a tsconfig', () => {
    const root = repository({
      '.git/HEAD': '',
      'tsconfig.json': JSON.stringify({ include: ['static'] }),
      'static/app/a.ts': '',
      'tools/script/a.js': '',
      'apps/web/tsconfig.json': '{}',
    });

    expect(holdsProgram(path.join(root, 'apps/web'))).toBe(true);
    expect(holdsProgram(path.join(root, 'static/app'))).toBe(true);
    expect(holdsProgram(path.join(root, 'tools/script'))).toBe(false);
  });
});
