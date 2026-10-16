import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultResolvedLayout,
  globToRegExp,
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
    expect([...new Set(sourceGlobs)].sort()).toEqual(['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect([...new Set(testGlobs)].sort()).toEqual([
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
    expect(isSourceFile('src/generated/service.ts')).toBe(true);
    expect(isSourceFile('src/main/features/reports/domain/service.ts')).toBe(true);
    expect(isSourceFile('generated/service.ts')).toBe(false);
    expect(isSourceFile('src/service.d.ts')).toBe(false);
  });
});

const readConfig = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'defaults', name), 'utf8'));

describe('built-in excluded globs', () => {
  it('match build output folders only at the project root', () => {
    const matches = (file) =>
      defaultResolvedLayout.excludedGlobs.some((glob) => globToRegExp(glob).test(file));

    for (const folder of ['dist', 'build', 'generated', 'coverage', 'reports', 'target']) {
      expect(matches(`${folder}/a.ts`)).toBe(true);
      expect(matches(`src/main/features/${folder}/domain/a.ts`)).toBe(false);
    }
    expect(matches('src/node_modules/pkg/a.ts')).toBe(true);
  });

  it('lint and type-check hand-written declaration files but keep them out of runtime checks', () => {
    expect(defaultResolvedLayout.excludedGlobs).not.toContain('**/*.d.ts');
    expect(defaultResolvedLayout.runtimeExcludedGlobs).toEqual([
      ...defaultResolvedLayout.excludedGlobs,
      '**/*.d.ts',
    ]);
    expect(readConfig('tsconfig.quality.json').exclude).not.toContain('**/*.d.ts');
    expect(readConfig('tsconfig.quality.json').compilerOptions.noEmit).toBe(true);
    expect(readConfig('tsconfig.stryker.json').exclude).not.toContain('**/*.d.ts');
  });
});

describe('generated files', () => {
  it.each([
    'src/api.generated.ts',
    'src/schema.gen.tsx',
    'src/__generated__/types.ts',
    'generated/service.ts',
    'src/proto/user_pb.js',
    'src/proto/user_grpc_pb.ts',
    'src/proto/user.pb.ts',
  ])('are not source: %s', (file) => {
    expect(isSourceFile(file)).toBe(false);
  });

  it.each(['src/generator.ts', 'src/gen.ts', 'src/generated-names.ts', 'src/pb.ts', 'src/web.ts'])(
    'does not treat a similar name as generated: %s',
    (file) => {
      expect(isSourceFile(file)).toBe(true);
    },
  );
});

describe('layout.excludedGlobs', () => {
  it('hides the files it lists from every check, like exclude', () => {
    const layout = resolveLayout({ excludedGlobs: ['dist/**', 'src/hidden/**'] }, [
      'src/vendor/**',
    ]);

    expect(layout.isSourceFile('src/hidden/big.ts')).toBe(false);
    expect(layout.isExcluded('src/hidden/big.ts')).toBe(true);
    expect(layout.isExcluded('src/vendor/a.ts')).toBe(true);
    expect(new RegExp(layout.excludePattern).test('src/hidden/big.ts')).toBe(true);
    expect(layout.isSourceFile('src/shown.ts')).toBe(true);
  });
});

describe('layout.isGeneratedPath', () => {
  it('is the one generated-code test: output folders at the root, generated names anywhere', () => {
    const layout = resolveLayout();

    expect(layout.isGeneratedPath('dist/b.svg')).toBe(true);
    expect(layout.isGeneratedPath('src/__generated__/types.ts')).toBe(true);
    expect(layout.isGeneratedPath('src/api.gen.ts')).toBe(true);
    expect(layout.isGeneratedPath('src/billing/build/math.ts')).toBe(false);
    expect(layout.isGeneratedPath('src/generated/service.ts')).toBe(false);
    expect(layout.isGeneratedPath('src/generator.ts')).toBe(false);
  });
});

describe('layout.isTestPath', () => {
  it('recognizes any file under a test folder, whatever its extension', () => {
    const layout = resolveLayout();

    expect(layout.isTestPath('src/ui/__tests__/logo.svg')).toBe(true);
    expect(layout.isTestPath('tests/logo.svg')).toBe(true);
    expect(layout.isTestPath('src/ui/logo.svg')).toBe(false);
  });
});

describe('layout.excludedGlobs', () => {
  it('replaces the built-in excluded globs and keeps the config exclude globs', () => {
    const layout = resolveLayout({ excludedGlobs: ['**/vendor/**'] }, ['legacy/**']);

    expect(layout.excludedGlobs).toEqual(['**/vendor/**', 'legacy/**']);
  });
});
