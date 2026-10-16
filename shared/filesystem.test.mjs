import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathInside } from './filesystem.mjs';

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
