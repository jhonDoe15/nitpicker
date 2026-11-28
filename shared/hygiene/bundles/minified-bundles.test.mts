import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import type { FileMap } from '../../../core/diff/git/test-support/fixture-files.mts';
import { trackedFiles } from '../tracked-files.mts';
import { minifiedBundleFindings } from './minified-bundles.mts';

const { createGitRepository } = useGitFixtures();

function reported(files: FileMap): string[] {
  const { root } = createGitRepository(files);
  return minifiedBundleFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
  }).map(({ path }) => path);
}

const BLOCK = 'function a(b){return b?c(b)=>d:new e}';
const MINIFIED = `${BLOCK.repeat(700)}\n`;
const FORMATTED = 'function value() {\n  return 1;\n}\n'.repeat(900);
const DATA_ROW = `  [${Array.from({ length: 120 }, (_, index) => `"item-${String(index)}"`).join(', ')}],\n`;
const DATA_TABLE = `export default [\n${DATA_ROW.repeat(40)}];\n`;
const ONE_LINE_DATA = `export default [${Array.from({ length: 4000 }, (_, i) => String(i)).join(',')}];\n`;

describe('committed-minified-bundle', () => {
  it('reports a minified script among the sources', () => {
    expect(reported({ 'src/vendor-lib.js': MINIFIED, 'tools/pm.cjs': MINIFIED })).toEqual([
      'src/vendor-lib.js',
      'tools/pm.cjs',
    ]);
    const mostlyOneLine = `${BLOCK.repeat(700)}\n${'// x\n'.repeat(20)}`;
    expect(reported({ 'src/lib.ts': mostlyOneLine })).toEqual(['src/lib.ts']);
  });

  it('handles files with very many lines', () => {
    const manyLines = 'const a = 1;\n'.repeat(150_000);
    expect(reported({ 'src/big.js': manyLines })).toEqual([]);
  });

  it('leaves formatted code, small files and long data tables alone', () => {
    expect(
      reported({
        'src/app.js': FORMATTED,
        'src/small.js': `${BLOCK.repeat(10)}\n`,
        'src/table.mjs': DATA_TABLE,
        'src/ids.js': ONE_LINE_DATA,
      }),
    ).toEqual([]);
  });

  it('leaves build output, dependencies, declarations and tests alone', () => {
    expect(
      reported({
        'package.json': '{}',
        'dist/bundle.js': MINIFIED,
        'node_modules/lib/index.js': MINIFIED,
        'vendor/lib.js': MINIFIED,
        'src/types.d.ts': MINIFIED,
        'src/__tests__/fixture.js': MINIFIED,
        'src/app.test.js': MINIFIED,
        'src/data.json': MINIFIED,
      }),
    ).toEqual([]);
  });

  it('skips listed paths that are outside the project, missing or not plain files', () => {
    const { root } = createGitRepository({ 'src/app.js': MINIFIED });

    expect(
      minifiedBundleFindings('repository-hygiene', {
        projectRoot: root,
        files: ['src/app.js', '../outside.js', 'src/missing.js', 'src'],
      }).map(({ path }) => path),
    ).toEqual(['src/app.js']);
  });
});
