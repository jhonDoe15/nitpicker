import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { workspacePaths } from './entries.mjs';

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
