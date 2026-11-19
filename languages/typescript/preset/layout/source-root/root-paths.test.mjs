import { describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { expandBraces, pathBelowRoot, rootOf, sourcePathUnder } from './root-paths.mjs';

const CWD = '/work/project';

describe('source paths under the project root', () => {
  it('finds the project-relative path of an absolute file under a "." root', () => {
    expect(sourcePathUnder(['.'], `${CWD}/lib/x.js`, CWD)).toBe('lib/x.js');
    expect(sourcePathUnder(['.'], `${CWD}/index.js`, CWD)).toBe('index.js');
    expect(sourcePathUnder(['.'], '/elsewhere/index.js', CWD)).toBeUndefined();
    expect(sourcePathUnder(['.'], 'lodash', CWD)).toBeUndefined();
  });

  it('keeps finding paths below a named root', () => {
    expect(sourcePathUnder(['src'], `${CWD}/src/a.ts`, CWD)).toBe('src/a.ts');
    expect(sourcePathUnder(['src'], `${CWD}/lib/a.ts`, CWD)).toBeUndefined();
  });

  it('prefers the most specific root', () => {
    expect(rootOf(['.', 'lib'], 'lib/a.js')).toBe('lib');
    expect(rootOf(['.', 'lib'], 'index.js')).toBe('.');
    expect(pathBelowRoot(['.'], 'lib/a.js')).toBe('lib/a.js');
    expect(pathBelowRoot(['src'], 'src/a/b.ts')).toBe('a/b.ts');
    expect(pathBelowRoot(['src'], 'other/b.ts')).toBe('other/b.ts');
  });

  it('hides dependency and config files from the layout under a "." root', () => {
    const layout = resolveLayout({ sourceRoots: ['.'] }, [], { javascript: true });
    const absolute = (file) => `${process.cwd()}/${file}`;

    expect(layout.sourcePathOf(absolute('lib/x.js'))).toBe('lib/x.js');
    expect(layout.sourcePathOf(absolute('node_modules/dep/index.js'))).toBeUndefined();
    expect(layout.sourcePathOf(absolute('rollup.config.mjs'))).toBeUndefined();
  });

  it('expands brace globs one option at a time', () => {
    expect(expandBraces('*.config.{js,mjs}')).toEqual(['*.config.js', '*.config.mjs']);
    expect(expandBraces('a/{b,c}/{d,e}')).toEqual(['a/b/d', 'a/b/e', 'a/c/d', 'a/c/e']);
    expect(expandBraces('plain/**')).toEqual(['plain/**']);
  });

  it('keeps sample and documentation folders out under a "." root but not scripts', () => {
    const layout = resolveLayout({ sourceRoots: ['.'] }, [], { javascript: true });

    const files = ['examples/a.js', 'example/a.js', 'bench/a.js', 'benchmarks/a.js', 'docs/a.js'];

    expect(files.filter((file) => layout.isSourceFile(file))).toEqual([]);
    expect(layout.isSourceFile('scripts/build.js')).toBe(true);
  });
});
