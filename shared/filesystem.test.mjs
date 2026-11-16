import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesEndingWith, pathInside } from './filesystem.mjs';

describe('pathInside', () => {
  it('resolves a path inside the root and refuses one that leaves it', () => {
    const root = path.resolve('/project');

    expect(
      ['src/a.ts', '..', '../other/a.ts', '/etc/passwd', '..cache/a.ts'].map((relative) =>
        pathInside(root, relative),
      ),
    ).toEqual([
      path.join(root, 'src/a.ts'),
      undefined,
      undefined,
      undefined,
      path.join(root, '..cache/a.ts'),
    ]);
  });
});

describe('filesEndingWith', () => {
  it('lists the files with the extension under each existing directory, sorted', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'files-ending-'));
    try {
      mkdirSync(path.join(root, 'a/b'), { recursive: true });
      writeFileSync(path.join(root, 'a/b/Two.kt'), '');
      writeFileSync(path.join(root, 'a/One.kt'), '');
      writeFileSync(path.join(root, 'a/Skip.java'), '');

      expect(filesEndingWith([path.join(root, 'a'), path.join(root, 'missing')], '.kt')).toEqual([
        path.join(root, 'a/One.kt'),
        path.join(root, 'a/b/Two.kt'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
