import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { matchingFiles } from './matching-files.mts';

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-prettier-matching-'));
  temporaryRoots.push(root);
  for (const name of [
    '.x.json',
    'root.ts',
    'src/.d/a.ts',
    'src/.d/deep/b.mjs',
    'src/data.json',
    'src/other.txt',
    'src/node_modules/dependency/index.ts',
    'node_modules/dependency/index.ts',
    '.git/hidden.ts',
  ]) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '');
  }
  return root;
}

describe('Prettier formatting candidates', () => {
  it('includes hidden files once across overlapping root, recursive and literal patterns', async () => {
    const root = project();

    expect(
      await matchingFiles(root, ['*.{ts,json}', './src/**/*.{ts,mjs,json}', 'src/.d/a.ts']),
    ).toEqual(['.x.json', 'root.ts', 'src/.d/a.ts', 'src/.d/deep/b.mjs', 'src/data.json']);
  });

  it('bounds nonrecursive patterns and tolerates absent or non-directory roots', async () => {
    const root = project();

    expect(await matchingFiles(root, ['src/*/*.ts', 'missing/**/*.ts', 'root.ts/*.ts'])).toEqual([
      'src/.d/a.ts',
    ]);
    expect(await matchingFiles(root, ['*.ts'])).toEqual(['root.ts']);
  });

  it('skips dependency trees and git metadata even when they are explicit pattern roots', async () => {
    const root = project();

    expect(
      await matchingFiles(root, [
        '**/*.ts',
        'node_modules/**/*.ts',
        'src/node_modules/**/*.ts',
        '.git/**/*.ts',
      ]),
    ).toEqual(['root.ts', 'src/.d/a.ts']);
  });

  it('does not follow linked files or directories, including literal pattern roots', async () => {
    const root = project();
    symlinkSync(path.join(root, 'src'), path.join(root, 'linked'), 'dir');
    symlinkSync(path.join(root, 'root.ts'), path.join(root, 'alias.ts'), 'file');

    expect(await matchingFiles(root, ['**/*.ts', 'linked/**/*.ts', 'linked/.d/*.ts'])).toEqual([
      'root.ts',
      'src/.d/a.ts',
    ]);
  });
});
