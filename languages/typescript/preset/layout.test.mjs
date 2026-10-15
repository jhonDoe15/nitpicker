import {
  expectedOutput31_25,
  expectedOutput32_23,
} from '../../../core/diff/fixtures/expected-output/languages-typescript-preset-layout.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  sourceGlobs,
  testGlobs,
  isSourceFile,
  isTestFile,
  resolveLayout,
  sourceRoot,
  testRoots,
} from './layout.mjs';

describe('common layout', () => {
  it('keeps JSON-only tool configurations aligned with the layout', () => {
    const defaults = path.join(import.meta.dirname, 'defaults');
    const readConfig = (name) => JSON.parse(readFileSync(path.join(defaults, name), 'utf8'));
    const typecheck = readConfig('tsconfig.quality.json');
    const stryker = readConfig('tsconfig.stryker.json');
    const duplicates = readConfig('jscpd.json');
    const knip = readConfig('knip.json');
    const roots = [sourceRoot, ...testRoots];
    const includes = roots.map((root) => `${root}/**/*`);
    expect([...typecheck.include].sort()).toEqual([...includes, 'vitest*.ts'].sort());
    expect([...stryker.include].sort()).toEqual([...includes, 'stryker.vitest.config.ts'].sort());
    for (const root of roots) {
      expect(knip.project.some((glob) => glob.startsWith(`${root}/**/`))).toBe(true);
    }
    expect(duplicates.path).toContain(sourceRoot);
    expect(duplicates.path).toContain(testRoots[0]);
  });
  it('selects both conventional source and test locations without treating colocated tests as source', () => {
    expect([...new Set(sourceGlobs)].sort()).toEqual(expectedOutput31_25());
    expect([...new Set(testGlobs)].sort()).toEqual(expectedOutput32_23());
    for (const file of ['test/service.test.ts', 'tests/service.test.ts', 'src/service.spec.ts']) {
      expect(isTestFile(file)).toBe(true);
      expect(isSourceFile(file)).toBe(false);
    }
    expect(isSourceFile('src/service.ts')).toBe(true);
    expect(isSourceFile('src/main/features/service.ts')).toBe(true);
    expect(isSourceFile('src/generated/service.ts')).toBe(false);
    expect(isSourceFile('src/service.d.ts')).toBe(false);
  });
});

describe('layout.excludedGlobs', () => {
  it('replaces the built-in excluded globs and keeps the config exclude globs', () => {
    const layout = resolveLayout({ excludedGlobs: ['**/vendor/**'] }, ['legacy/**']);

    expect(layout.excludedGlobs).toEqual(['**/vendor/**', 'legacy/**']);
  });
});
