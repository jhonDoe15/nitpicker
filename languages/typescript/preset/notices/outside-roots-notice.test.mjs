import { describe, expect, it } from 'vitest';
import { outsideRootsNotices } from './outside-roots-notice.mjs';

describe('outsideRootsNotices', () => {
  it('names a changed TypeScript file that no source or test root covers', () => {
    const [notice] = outsideRootsNotices(['src/a.ts', 'scripts/slop.ts'], {});

    expect(notice).toContain('1 changed TypeScript file is outside layout.sourceRoots');
    expect(notice).toContain('scripts/slop.ts');
    expect(notice).not.toContain('src/a.ts');
    expect(notice).toContain('"exclude" in nitpicker.config.json');
  });

  it('lists three files and counts the rest', () => {
    const files = ['lib/d.tsx', 'lib/c.mts', 'lib/b.cts', 'lib/a.ts'];
    const [notice] = outsideRootsNotices(files, {});

    expect(notice).toContain('4 changed TypeScript files are outside');
    expect(notice).toContain('lib/a.ts, lib/b.cts, lib/c.mts, and 1 more');
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
