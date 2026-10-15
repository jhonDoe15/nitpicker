import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { globToRegExp, resolveLayout } from '../layout.mjs';
import {
  isCustomLayout,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
  layoutTsconfig,
} from '../tool-configs.mjs';
import {
  customLayout,
  readDefault,
  removeTemporaryRoots,
  trackTemporaryRoot,
} from './layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('resolveLayout', () => {
  it('derives globs, roots and predicates from custom roots', () => {
    expect(customLayout.sourceGlobs).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(customLayout.testGlobs).toEqual([
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(customLayout.graphRoots).toEqual(['lib', 'spec']);
    expect(customLayout.graphIncludeOnly).toBe('^(lib|spec)(?:/|$)');
    expect(customLayout.isSourceFile('lib/service.ts')).toBe(true);
    expect(customLayout.isSourceFile('src/service.ts')).toBe(false);
    expect(customLayout.isTestFile('spec/service.test.ts')).toBe(true);
    expect(customLayout.isTestFile('lib/service.spec.ts')).toBe(true);
    expect(customLayout.isTestFile('lib/__tests__/service.ts')).toBe(true);
    expect(customLayout.isTestFile('test/service.test.ts')).toBe(false);
    expect(customLayout.isSourceFile('lib/service.test.ts')).toBe(false);
    expect(customLayout.isRunnableTestFile('spec/helper.ts')).toBe(false);
    expect(customLayout.isTestFixture('/repo/spec/fixtures/app.ts')).toBe(true);
    expect(customLayout.isTestFixture('/repo/tests/fixtures/app.ts')).toBe(false);
    expect(customLayout.sourceRootOf('/repo/lib/a.ts')).toBe('lib');
  });
  it('treats exclude globs as excluded from source, test and graph analysis', () => {
    expect(customLayout.isExcluded('lib/legacy/old.ts')).toBe(true);
    expect(customLayout.isExcluded('lib/live/new.ts')).toBe(false);
    expect(customLayout.isSourceFile('lib/legacy/old.ts')).toBe(false);
    expect(customLayout.isSourceUnderRoot('lib/legacy/old.ts', 'lib')).toBe(false);
    expect(customLayout.isSourceUnderRoot('lib/live/new.ts', 'lib')).toBe(true);
    expect([...new Set(customLayout.excludedGlobs)].sort()).toEqual([
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      'lib/legacy/**',
    ]);
    expect(new RegExp(customLayout.excludePattern).test('lib/legacy/old.ts')).toBe(true);
    expect(new RegExp(customLayout.excludePattern).test('lib/live/new.ts')).toBe(false);
    expect(resolveLayout().excludePattern).toBeUndefined();
  });
  it('lists project code files under the roots without excluded files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-test-'));
    trackTemporaryRoot(root);
    for (const file of [
      'lib/a.ts',
      'lib/legacy/b.ts',
      'spec/a.test.ts',
      'src/ignored.ts',
      'lib/dist/c.ts',
    ]) {
      const filePath = path.join(root, file);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'export {};\n');
    }
    expect(customLayout.projectCodeFiles(root).sort()).toEqual(['lib/a.ts', 'spec/a.test.ts']);
  });
  it('keeps the default layout identical to the previous fixed roots', () => {
    const layout = resolveLayout();
    expect(layout.sourceRoots).toEqual(['src']);
    expect(layout.testRoots).toEqual(['test', 'tests']);
    expect(layout.graphIncludeOnly).toBe('^(src|test|tests)(?:/|$)');
  });
});
describe('globToRegExp', () => {
  it.each([
    ['lib/legacy/**', 'lib/legacy/a/b.ts', true],
    ['lib/legacy/**', 'lib/legacy', false],
    ['lib/legacy/**', 'lib/other/a.ts', false],
    ['**/dist/**', 'dist/a.js', true],
    ['**/dist/**', 'pkg/dist/a.js', true],
    ['**/*.d.ts', 'a/b.d.ts', true],
    ['**/*.d.ts', 'a/b.ts', false],
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/a/b.ts', false],
    ['lib/**/*.{ts,mts}', 'lib/a/b.mts', true],
    ['lib/**/*.{ts,mts}', 'lib/a/b.js', false],
    ['a?.ts', 'ab.ts', true],
    ['a.b/**', 'aXb/c.ts', false],
  ])('%s against %s is %s and agrees with path.matchesGlob', (glob, value, expected) => {
    expect(globToRegExp(glob).test(value)).toBe(expected);
    expect(path.posix.matchesGlob(value, glob)).toBe(expected);
  });
});
describe('layout-aware tool configurations', () => {
  const sorted = (values) => [...values].sort();
  const defaultLayout = resolveLayout();
  it('reproduce the shipped JSON configurations for the default layout', () => {
    for (const name of ['tsconfig.quality.json', 'tsconfig.stryker.json']) {
      const base = readDefault(name);
      const rewritten = layoutTsconfig(base, defaultLayout);
      expect(sorted(rewritten.include)).toEqual(sorted(base.include));
      expect(rewritten.exclude).toEqual(base.exclude);
    }
    const knip = readDefault('knip.json');
    const rewrittenKnip = layoutKnipConfig(knip, defaultLayout);
    for (const key of ['entry', 'project', 'ignore']) {
      expect(sorted(rewrittenKnip[key])).toEqual(sorted(knip[key]));
    }
    const jscpd = readDefault('jscpd.json');
    expect(layoutJscpdConfig(jscpd, defaultLayout)).toEqual(jscpd);
  });
  it('link the shipped files unchanged for the default layout', () => {
    for (const name of ['knip.json', 'jscpd.json']) {
      expect(layoutTransformFor(name, defaultLayout)).toBeUndefined();
    }
    expect(layoutTransformFor('knip.json', customLayout)).toBeTypeOf('function');
    expect(layoutTransformFor('vitest.quality.config.ts', customLayout)).toBeUndefined();
  });
  it('move the roots and add the exclude globs for a custom layout', () => {
    const tsconfig = layoutTsconfig(readDefault('tsconfig.quality.json'), customLayout);
    expect(tsconfig.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect([...new Set(tsconfig.exclude)].sort()).toEqual([
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      'lib/legacy/**',
    ]);

    const knip = layoutKnipConfig(readDefault('knip.json'), customLayout);
    expect([...new Set(knip.entry)].sort()).toEqual([
      'lib/main.ts',
      'lib/main/composition-root.{ts,mts,js,mjs}',
      'lib/main/composition-root/index.{ts,mts,js,mjs}',
      'lib/main/main.ts',
      'lib/main/server.ts',
      'lib/main/vitest.config.ts',
      'lib/server.ts',
      'spec/fixtures/*harness*.{ts,mts,mjs}',
      'spec/vitest.config.ts',
      'vitest.config.ts',
      'vitest.quality.config.ts',
    ]);
    expect([...new Set(knip.project)].sort()).toEqual([
      '*.config.{ts,mts,mjs}',
      'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...knip.entry, ...knip.project, ...knip.ignore].join(' ')).not.toMatch(/\bsrc\//);
    expect([...new Set(knip.ignore)].sort()).toEqual([
      '.nitpicker-*',
      '.stryker-tmp/**',
      'coverage/**',
      'lib/**/*.d.ts',
      'lib/**/dist/**',
      'lib/legacy/**',
      'reports/**',
    ]);

    const jscpd = layoutJscpdConfig(readDefault('jscpd.json'), customLayout);
    expect(jscpd.path).toEqual(['lib', 'spec']);
    expect([...new Set(jscpd.ignore)].sort()).toEqual([
      '**/*.d.ts',
      '**/.stryker-tmp/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      'lib/legacy/**',
    ]);
  });
  it('add the configured entry points to the knip entries', () => {
    const layout = { ...customLayout, entryPoints: ['lib/tools/*-runner.mjs'] };

    const knip = layoutKnipConfig(readDefault('knip.json'), layout);

    expect([...new Set(knip.entry)].sort()).toEqual([
      'lib/main.ts',
      'lib/main/composition-root.{ts,mts,js,mjs}',
      'lib/main/composition-root/index.{ts,mts,js,mjs}',
      'lib/main/main.ts',
      'lib/main/server.ts',
      'lib/main/vitest.config.ts',
      'lib/server.ts',
      'lib/tools/*-runner.mjs',
      'spec/fixtures/*harness*.{ts,mts,mjs}',
      'spec/vitest.config.ts',
      'vitest.config.ts',
      'vitest.quality.config.ts',
    ]);
  });
  it('count entry points as a custom layout', () => {
    expect(isCustomLayout({ ...resolveLayout(), entryPoints: ['tools/run.mjs'] })).toBe(true);
    expect(isCustomLayout(resolveLayout())).toBe(false);
  });
});
