import { describe, expect, it } from 'vitest';
import { outsideRootsNotices } from './outside-roots-notice.mjs';

describe('outsideRootsNotices', () => {
  it('names a changed TypeScript file that no source or test root covers', () => {
    expect(outsideRootsNotices(['src/a.ts', 'scripts/slop.ts'], {})).toEqual([
      '1 changed TypeScript file is outside layout.sourceRoots and layout.testRoots, so nothing checks it: ' +
        'scripts/slop.ts. Add its folder to layout.sourceRoots, or list it in "exclude" in nitpicker.config.json ' +
        'to silence this.',
    ]);
  });

  it('lists three files and counts the rest', () => {
    const files = ['lib/d.tsx', 'lib/c.mts', 'lib/b.cts', 'lib/a.ts'];

    expect(outsideRootsNotices(files, {})).toEqual([
      '4 changed TypeScript files are outside layout.sourceRoots and layout.testRoots, so nothing checks them: ' +
        'lib/a.ts, lib/b.cts, lib/c.mts, and 1 more. Add their folders to layout.sourceRoots, or list them in ' +
        '"exclude" in nitpicker.config.json to silence this.',
    ]);
  });

  it('follows the configured source and test roots', () => {
    const policy = { layout: { sourceRoots: ['server'], testRoots: ['spec'] } };

    expect(outsideRootsNotices(['server/api.ts', 'spec/api.ts'], policy)).toEqual([]);
    expect(outsideRootsNotices(['src/a.ts'], policy)).toHaveLength(1);
  });

  it('stays quiet for files nothing should check', () => {
    const files = [
      'vite.config.ts',
      'types/global.d.ts',
      '.storybook/main.ts',
      'dist/out.ts',
      'node_modules/x/index.ts',
      'readme.md',
      'scripts/tool.js',
    ];

    expect(outsideRootsNotices(files, {})).toEqual([]);
  });

  it('stays quiet for folders the project excludes', () => {
    expect(outsideRootsNotices(['lib/a.ts'], { exclude: ['lib/**'] })).toEqual([]);
  });
});
