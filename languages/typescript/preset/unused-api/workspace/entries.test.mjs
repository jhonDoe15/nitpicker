import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { publicEntryGlobs, workspacePaths } from './entries.mjs';

const layout = resolveLayoutFor({ layout: { sourceRoots: ['src/main'] } });
let directory;

function packageAt(name, manifest, files) {
  const dir = path.join(directory, name);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), 'export {};\n');
  }
  return { dir, name, manifest };
}

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('workspace package paths', () => {
  it('maps a package to the source its exports name, else to the index of a source root', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-entries-'));
    const exported = packageAt(
      'exported',
      { exports: { '.': { types: './dist/index.d.ts', import: './lib/entry.ts' } } },
      ['lib/entry.ts'],
    );
    const built = packageAt('built', { main: 'dist/index.js' }, ['src/main/index.tsx']);
    const roots = (dir) => ['src/main/*', 'src/*', '*'].map((root) => path.join(dir, root));

    expect(workspacePaths([exported, built], layout)).toEqual({
      exported: [path.join(exported.dir, 'lib/entry.ts')],
      'exported/*': roots(exported.dir),
      built: [path.join(built.dir, 'src/main/index.tsx')],
      'built/*': roots(built.dir),
    });
  });
});

describe('public entry globs', () => {
  it('lists every source file the manifest names, subpaths and conditions included', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-entries-'));
    const entry = packageAt(
      'lib',
      {
        main: 'lib/main.ts',
        types: 'dist/index.d.ts',
        exports: {
          '.': { types: './dist/index.d.ts', import: './lib/entry.ts' },
          './extra': './lib/extra.ts',
          './icons/*': './lib/icons/*.ts',
          './gone': './lib/missing.ts',
        },
      },
      ['lib/main.ts', 'lib/entry.ts', 'lib/extra.ts'],
    );

    expect(publicEntryGlobs(entry, layout).map((glob) => path.relative(entry.dir, glob))).toEqual([
      'lib/main.ts',
      'lib/entry.ts',
      'lib/extra.ts',
      'lib/icons/*.ts',
    ]);
  });

  it('falls back to the index of a source root when the manifest names no source file', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-entries-'));
    const built = packageAt('built', { main: 'dist/index.js', types: 'dist/index.d.ts' }, [
      'src/main/index.tsx',
    ]);
    const bare = packageAt('bare', { name: 'bare' }, ['docs/readme.ts']);

    expect(publicEntryGlobs(built, layout)).toEqual([path.join(built.dir, 'src/main/index.tsx')]);
    expect(publicEntryGlobs(bare, layout)).toEqual([]);
  });
});
