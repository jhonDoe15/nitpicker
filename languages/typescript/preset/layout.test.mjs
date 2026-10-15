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
    expect([...stryker.include].sort()).toEqual(
      [...includes.filter((glob) => glob !== 'e2e/**/*'), 'stryker.vitest.config.ts'].sort(),
    );
    for (const root of roots) {
      expect(knip.project.some((glob) => glob.startsWith(`${root}/**/`))).toBe(true);
    }
    expect(duplicates.path).toContain(sourceRoot);
    expect(duplicates.path).toContain(testRoots[0]);
  });
  it('selects both conventional source and test locations without treating colocated tests as source', () => {
    expect([...new Set(sourceGlobs)].sort()).toEqual(['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect([...new Set(testGlobs)].sort()).toEqual([
      '__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'test/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
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

describe('repo-root test folders', () => {
  it.each([
    '__tests__/panel.test.tsx',
    '__tests__/ui/panel.tsx',
    'e2e/checkout.spec.ts',
    'e2e/support/page.ts',
    'src/ui/__tests__/panel.tsx',
  ])('treats %s as a test file, not source', (file) => {
    expect(isTestFile(file)).toBe(true);
    expect(isSourceFile(file)).toBe(false);
  });

  it('lists both folders as default test roots and selects their code files', () => {
    expect(testRoots).toEqual(['test', 'tests', '__tests__', 'e2e']);
    expect(testGlobs).toEqual([
      'test/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });

  it('does not treat a nested e2e or __tests__ folder outside a root as a test folder', () => {
    expect(isTestFile('lib/e2e/helper.ts')).toBe(false);
    expect(isTestFile('docs/e2e/example.ts')).toBe(false);
  });

  it('keeps a configured test root list as given', () => {
    const layout = resolveLayout({ testRoots: ['spec'] });

    expect(layout.isTestFile('e2e/checkout.spec.ts')).toBe(false);
    expect(layout.isTestFile('spec/panel.ts')).toBe(true);
  });
});

describe('layout.excludedGlobs', () => {
  it('replaces the built-in excluded globs and keeps the config exclude globs', () => {
    const layout = resolveLayout({ excludedGlobs: ['**/vendor/**'] }, ['legacy/**']);

    expect(layout.excludedGlobs).toEqual(['**/vendor/**', 'legacy/**']);
  });
});
