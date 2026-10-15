import { afterAll, describe, expect, it } from 'vitest';
import {
  FILE_SELECTION,
  customPolicy as policy,
  loadConfig,
  removeTemporaryRoots,
} from './layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('package-owned child configs', () => {
  it('eslint.config.mjs lints the custom roots and ignores excluded paths', async () => {
    const config = await loadConfig('defaults/eslint.config.mjs', policy, FILE_SELECTION);
    const ignores = config.flatMap((entry) =>
      entry.files === undefined ? (entry.ignores ?? []) : [],
    );
    expect([...new Set(ignores)].sort()).toEqual([
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      '.stryker-tmp/**',
      'lib/legacy/**',
    ]);
    const files = config.flatMap((entry) => entry.files ?? []).flat();
    expect([...new Set(files)].sort()).toEqual([
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
      'lib/main/features/*/adapters/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/main/features/*/domain/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/unit/**/*.ts',
    ]);
    expect(files.filter((glob) => glob.startsWith('src/') || glob.startsWith('test'))).toEqual([]);
  });
  it('eslint-config policies/base.mjs and coding-standards.config.mjs follow the same layout', async () => {
    const config = await loadConfig(
      'eslint-config/policies/coding-standards.config.mjs',
      policy,
      FILE_SELECTION,
    );
    expect([...new Set(config[0].ignores)].sort()).toEqual([
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
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      '.stryker-tmp/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/__tests__/**',
      'lib/legacy/**',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
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
  it('crap.config.mjs measures the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/crap.config.mjs', policy);
    expect(config.sourcePaths).toEqual(['lib']);
    expect([...new Set(config.excludes)].sort()).toEqual([
      '**/*.d.ts',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/reports/**',
      '**/target/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/legacy/**',
      'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });
  it('stryker.config.mjs mutates the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/stryker.config.mjs', policy);
    expect([...new Set(config.mutate)].sort()).toEqual([
      '!**/*.d.ts',
      '!**/build/**',
      '!**/coverage/**',
      '!**/dist/**',
      '!**/generated/**',
      '!**/node_modules/**',
      '!**/reports/**',
      '!**/target/**',
      '!lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '!lib/**/__tests__/**',
      '!lib/legacy/**',
      '!spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(config.mutate.filter((glob) => glob.includes('src/'))).toEqual([]);
    expect(config.ignorePatterns).toEqual([
      'lib/dist',
      'spec/integration',
      'reports',
      '.nitpicker-*',
      '!.nitpicker-diff-stryker.*',
      '!.nitpicker-diff-tsconfig.stryker.json',
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
