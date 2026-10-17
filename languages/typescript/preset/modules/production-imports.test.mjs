import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { packageEntryFiles, productionReach } from './production-imports.mjs';

const { temporaryRoot } = useGitFixtures();

describe('productionReach', () => {
  it('maps every file production code reaches, through hidden barrels and every import form, to its importer', () => {
    const root = temporaryRoot('nitpicker-production-reach-');
    writeFiles(root, {
      'src/a.ts': "import { b } from './vendor/b.js';\nexport * from './vendor/index';\n",
      'src/z.ts': "const d = await import('./vendor/d');\nimport 'left-pad';\n",
      'src/vendor/index.ts': "export * from './feature';\n",
      'src/vendor/feature.ts': 'export {};\n',
      'src/vendor/b.ts': 'export const b = 1;\n',
      'src/vendor/d.ts': 'export {};\n',
      'src/vendor/unused.ts': 'export {};\n',
    });

    expect(
      Object.fromEntries(productionReach(root, { importers: ['src/a.ts', 'src/z.ts'] })),
    ).toEqual({
      'src/vendor/b.ts': 'src/a.ts',
      'src/vendor/index.ts': 'src/a.ts',
      'src/vendor/feature.ts': 'src/a.ts',
      'src/vendor/d.ts': 'src/z.ts',
    });
  });

  it('counts package.json main, bin and exports targets as production entries', () => {
    const root = temporaryRoot('nitpicker-production-entries-');
    writeFiles(root, {
      'package.json': JSON.stringify({
        main: './src/vendor/main.ts',
        bin: { tool: 'src/vendor/server.ts' },
        exports: { '.': { import: './src/vendor/lib.ts' }, './missing': './dist/missing.js' },
      }),
      'src/vendor/main.ts': 'export {};\n',
      'src/vendor/server.ts': "import './helper';\n",
      'src/vendor/helper.ts': 'export {};\n',
      'src/vendor/lib.ts': 'export {};\n',
    });
    const files = [
      'package.json',
      'src/vendor/main.ts',
      'src/vendor/server.ts',
      'src/vendor/helper.ts',
      'src/vendor/lib.ts',
    ];
    const entries = packageEntryFiles(root, files);

    expect(Object.fromEntries(productionReach(root, { importers: [], entries }))).toEqual({
      'src/vendor/main.ts': 'package.json main',
      'src/vendor/server.ts': 'package.json bin',
      'src/vendor/lib.ts': 'package.json exports',
      'src/vendor/helper.ts': 'package.json bin',
    });
  });

  it('reads no entries from a package.json that does not parse', () => {
    const root = temporaryRoot('nitpicker-production-broken-');
    writeFiles(root, { 'package.json': '{ "main": ', 'src/main.ts': 'export {};\n' });

    expect(packageEntryFiles(root, ['package.json', 'src/main.ts'])).toEqual([]);
  });
});
