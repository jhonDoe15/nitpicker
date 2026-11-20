import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryRepositories } from '../../../../../scripts/test-support/temporary-repositories.mts';
import { resolveLayout } from '../../layout.mts';
import { codeFilesUnder, existingRoots } from './project-code-files.mts';

const repository = temporaryRepositories('layout-code-');

function projectRoot(): string {
  return repository({ 'src/value.ts': 'export const value = 42;' });
}

describe('project code traversal', () => {
  it('finds code below a configured project root', () => {
    expect(codeFilesUnder(resolveLayout(), projectRoot(), ['src'])).toEqual(['src/value.ts']);
  });

  it('normalizes a relative project root before checking containment', () => {
    const root = path.relative(process.cwd(), projectRoot());
    expect(codeFilesUnder(resolveLayout(), root, ['src'])).toEqual(['src/value.ts']);
    expect(existingRoots(root, ['src', 'missing'])).toEqual(['src']);
  });

  it('rejects a source root that escapes the project', () => {
    const root = projectRoot();
    expect(() => existingRoots(root, ['../outside'])).toThrow('Source root is outside the project');
    expect(() => codeFilesUnder(resolveLayout(), root, ['../outside'])).toThrow(
      'Source root is outside the project',
    );
  });

  it('analyzes the root files and lib of a package whose code sits at the project root', () => {
    const files = [
      'index.js',
      'lib/x.js',
      'test/x.test.js',
      'lib/x.spec.js',
      'node_modules/dep/index.js',
      'dist/bundle.js',
      'coverage/lcov.js',
      '.github/script.js',
      'reports/quality/diff/report.js',
      'eslint.config.js',
      'rollup.config.mjs',
      'vitest.config.ts',
      'Gruntfile.js',
    ];
    const root = repository(Object.fromEntries(files.map((file) => [file, 'module.exports = 1;'])));
    const layout = resolveLayout({ sourceRoots: ['.', './'] }, [], { javascript: true });

    expect(layout.sourceRoots).toEqual(['.', '.']);
    expect(codeFilesUnder(layout, root, ['.']).filter(layout.isSourceFile)).toEqual([
      'index.js',
      'lib/x.js',
    ]);
    expect(layout.sourceGlobs).toEqual([
      '**/*.{ts,mts,cts,js,mjs,cjs,jsx}',
      '**/*.{ts,mts,cts,js,mjs,cjs,jsx}',
    ]);
    expect(layout.isTestFile('test/x.test.js')).toBe(true);
    expect(layout.graphIncludeOnly).toBe('^');
  });

  it('lists each file once when the project root and other roots overlap', () => {
    const root = projectRoot();
    mkdirSync(path.join(root, 'test'));
    writeFileSync(path.join(root, 'test/value.test.ts'), 'export const test = 1;');
    const layout = resolveLayout({ sourceRoots: ['.'] });

    expect(codeFilesUnder(layout, root, ['.', 'test', 'src', 'test'])).toEqual([
      'src/value.ts',
      'test/value.test.ts',
    ]);
  });
});
