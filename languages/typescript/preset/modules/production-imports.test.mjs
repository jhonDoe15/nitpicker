import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { productionImports } from './production-imports.mjs';

const { temporaryRoot } = useGitFixtures();

describe('productionImports', () => {
  it('maps each project file an importer reaches to the first importer, through every import form', () => {
    const root = temporaryRoot('nitpicker-production-imports-');
    writeFiles(root, {
      'src/a.ts': "import { b } from './vendor/b.js';\nexport * from './vendor/c';\n",
      'src/z.ts':
        "const d = await import('./vendor/d');\nimport 'left-pad';\nimport './vendor/b';\n",
      'src/vendor/b.ts': 'export const b = 1;\n',
      'src/vendor/c.ts': 'export {};\n',
      'src/vendor/d.ts': 'export {};\n',
    });

    expect(
      Object.fromEntries(productionImports(root, ['src/z.ts', 'src/a.ts', 'src/gone.ts'])),
    ).toEqual({
      'src/vendor/b.ts': 'src/a.ts',
      'src/vendor/c.ts': 'src/a.ts',
      'src/vendor/d.ts': 'src/z.ts',
    });
  });
});
