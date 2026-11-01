import { afterAll, describe, expect, it } from 'vitest';
import { securitySupportGlobs } from '../eslint-config/policy/security-facts.mjs';
import {
  selectFilesAndIgnores,
  customPolicy as policy,
  loadConfig,
  removeTemporaryRoots,
} from './test-support/layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('package-owned child configs', () => {
  it('eslint.config.mjs lints the custom roots and ignores excluded paths', async () => {
    const config = await loadConfig('defaults/eslint.config.mjs', policy, selectFilesAndIgnores);
    const ignores = config.flatMap((entry) =>
      entry.files === undefined ? (entry.ignores ?? []) : [],
    );
    expect([...new Set(ignores)].sort()).toEqual([
      '**/node_modules/**',
      '.stryker-tmp/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/legacy/**',
      'reports/quality/**',
      'target/**',
    ]);
    const files = config.flatMap((entry) => entry.files ?? []).flat();
    expect([...new Set(files)].sort()).toEqual(
      [
        '**/*.cts',
        '**/*.mts',
        '**/*.ts',
        '**/*.tsx',
        'lib/**/*.config.*',
        'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'lib/**/.*rc.*',
        'lib/**/__tests__/**',
        'lib/**/__tests__/**/*.ts',
        'lib/**/test-support/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'lib/main/features/*/adapters/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'lib/main/features/*/domain/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'spec/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
        'spec/unit/**/*.ts',
        ...securitySupportGlobs(),
      ].sort(),
    );
    expect(files.filter((glob) => glob.startsWith('src/') || glob.startsWith('test'))).toEqual([]);
  });
  it('eslint.config.mjs turns on the script rules typescript-eslint leaves off for .js files', async () => {
    const config = await loadConfig('defaults/eslint.config.mjs', policy);
    const scriptEntry = config.find(
      (entry) =>
        entry.rules?.['no-var'] === 'error' &&
        entry.files?.includes('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'),
    );

    expect(scriptEntry?.rules).toEqual({
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
    });
  });
  it('eslint-config policies/base.mjs and coding-standards.config.mjs follow the same layout', async () => {
    const config = await loadConfig(
      'eslint-config/policies/coding-standards.config.mjs',
      policy,
      selectFilesAndIgnores,
    );
    expect([...new Set(config[0].ignores)].sort()).toEqual([
      '**/node_modules/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/legacy/**',
      'reports/quality/**',
      'target/**',
    ]);
    expect([...new Set(config.flatMap((entry) => entry.files ?? []).flat())].sort()).toEqual([
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/__tests__/**/*.ts',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/unit/**/*.ts',
    ]);
    const production = await loadConfig('eslint-config/policies/base.mjs', policy, (module) =>
      module.productionPolicyConfig({}).map(({ ignores }) => ({ ignores })),
    );
    expect([...new Set(production.flatMap((entry) => entry.ignores ?? []))].sort()).toEqual([
      '**/node_modules/**',
      '.stryker-tmp/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/__tests__/**',
      'lib/legacy/**',
      'reports/quality/**',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'target/**',
    ]);
  });
  it('production policy configs skip the module-load rule for configured entry points', async () => {
    const entryPolicy = {
      ...policy,
      layout: { ...policy.layout, entryPoints: ['lib/tools/run.mjs'] },
    };
    const build = (module) => module.productionPolicyConfig({});
    const plain = await loadConfig('eslint-config/policies/base.mjs', policy, build);
    const withEntries = await loadConfig('eslint-config/policies/base.mjs', entryPolicy, build);

    expect(plain.some((entry) => entry.files?.includes('lib/tools/run.mjs'))).toBe(false);
    expect(withEntries.at(-1)).toEqual({
      files: ['lib/tools/run.mjs'],
      rules: { 'nitpicker/report-module-load-effects': 'off' },
    });
  });
  it('production policy configs skip the module-load rule for the detected framework entry', async () => {
    const entryPolicy = {
      ...policy,
      layout: { ...policy.layout, entryPoints: ['lib/tools/run.mjs'] },
      frameworks: { defaultExports: [], entryPoints: ['src/main.tsx'] },
    };
    const build = (module) => module.productionPolicyConfig({});
    const config = await loadConfig('eslint-config/policies/base.mjs', entryPolicy, build);

    expect(config.at(-1)).toEqual({
      files: ['lib/tools/run.mjs', 'src/main.tsx'],
      rules: { 'nitpicker/report-module-load-effects': 'off' },
    });
  });
  it('crap.config.mjs measures the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/crap.config.mjs', policy);
    expect(config.sourcePaths).toEqual(['lib']);
    expect([...new Set(config.excludes)].sort()).toEqual([
      '**/*.d.ts',
      '**/node_modules/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'generated/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/legacy/**',
      'reports/quality/**',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'target/**',
    ]);
  });
  it('stryker.config.mjs mutates the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/stryker.config.mjs', policy);
    expect([...new Set(config.mutate)].sort()).toEqual([
      '!**/*.d.ts',
      '!**/node_modules/**',
      '!build/**',
      '!coverage/**',
      '!dist/**',
      '!generated/**',
      '!lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '!lib/**/__tests__/**',
      '!lib/legacy/**',
      '!reports/quality/**',
      '!spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '!target/**',
      'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(config.mutate.filter((glob) => glob.includes('src/'))).toEqual([]);
    expect(config.ignorePatterns).toEqual([
      'lib/dist',
      'spec/integration',
      '/reports/quality',
      '.nitpicker-*',
      '!.nitpicker-diff-stryker.*',
      '!.nitpicker-diff-tsconfig.stryker.json',
    ]);
  });
  it('crap.config.mjs and stryker.config.mjs skip test-support/ in a colocated layout', async () => {
    const colocated = { ...policy, layout: { ...policy.layout, colocatedTests: true } };
    const crap = await loadConfig('defaults/crap.config.mjs', colocated);
    const separateCrap = await loadConfig('defaults/crap.config.mjs', policy);
    expect(crap.excludes.filter((glob) => !separateCrap.excludes.includes(glob))).toEqual([
      'lib/**/test-support/**',
    ]);
    const stryker = await loadConfig('defaults/stryker.config.mjs', colocated);
    const separateStryker = await loadConfig('defaults/stryker.config.mjs', policy);
    expect(stryker.mutate.filter((glob) => !separateStryker.mutate.includes(glob))).toEqual([
      '!lib/**/test-support/**',
    ]);
  });
  it('dependency-cruiser.config.mjs rules and exclusions use the custom roots', async () => {
    const config = await loadConfig('defaults/dependency-cruiser.config.mjs', policy);
    const [productionToTest] = config.forbidden;
    expect(new RegExp(productionToTest.from.path).test('lib/live/a.ts')).toBe(true);
    expect(new RegExp(productionToTest.from.path).test('src/a.ts')).toBe(false);
    expect(new RegExp(productionToTest.to.path).test('spec/helper.ts')).toBe(true);
    expect(new RegExp(productionToTest.to.path).test('lib/a.test.ts')).toBe(true);
    expect(new RegExp(productionToTest.to.path).test('test/helper.ts')).toBe(false);
    const doNotFollow = new RegExp(config.options.doNotFollow.path);
    expect(doNotFollow.test('lib/legacy/old.ts')).toBe(true);
    expect(doNotFollow.test('lib/live/new.ts')).toBe(false);
  });
});
