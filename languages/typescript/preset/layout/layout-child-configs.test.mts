import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { securitySupportGlobs } from '../eslint-config/policy/security-facts.mjs';
import {
  customPolicy as policy,
  loadConfig,
  removeTemporaryRoots,
  temporaryProject,
} from './test-support/layout-config-helpers.mts';
import { loadDefaultConfig, selectFilesAndIgnores } from './test-support/layout-readers.mts';
import { type ConfigEntry, sortedUnique } from './test-support/layout-views.mts';

type ForbiddenRule = {
  readonly from: { readonly path: string };
  readonly to: { readonly path: string };
};

type ToolConfig = {
  readonly sourcePaths: string[];
  readonly excludes: string[];
  readonly mutate: string[];
  readonly ignorePatterns: string[];
  readonly forbidden: [ForbiddenRule, ...ForbiddenRule[]];
  readonly options: { readonly doNotFollow: { readonly path: string } };
};

type PolicyConfigs = {
  productionPolicyConfig(options: object): ConfigEntry[];
};

function buildProduction(module: PolicyConfigs): ConfigEntry[] {
  return module.productionPolicyConfig({});
}

afterAll(removeTemporaryRoots);
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('package-owned child configs', () => {
  it('eslint.config.mjs lints the custom roots and ignores excluded paths', async () => {
    vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', temporaryProject({}));
    const config = await loadConfig('defaults/eslint.config.mjs', policy, selectFilesAndIgnores);
    const ignores = config.flatMap((entry) =>
      entry.files === undefined ? (entry.ignores ?? []) : [],
    );
    expect(sortedUnique(ignores)).toEqual([
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
    expect(sortedUnique(files)).toEqual(
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
    const config = await loadDefaultConfig<ConfigEntry[]>('defaults/eslint.config.mjs', policy);
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
    expect(sortedUnique(config[0]?.ignores ?? [])).toEqual([
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
    const production = await loadConfig(
      'eslint-config/policies/base.mjs',
      policy,
      (module: PolicyConfigs) =>
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
    const plain = await loadConfig('eslint-config/policies/base.mjs', policy, buildProduction);
    const withEntries = await loadConfig(
      'eslint-config/policies/base.mjs',
      entryPolicy,
      buildProduction,
    );

    expect(plain.some((entry) => entry.files?.includes('lib/tools/run.mjs'))).toBe(false);
    expect(withEntries.at(-1)).toEqual({
      files: ['lib/tools/run.mjs'],
      rules: { 'nitpicker/report-module-load-effects': 'off' },
    });
  });
  it('the logging policy lets entry points reference the standard streams', async () => {
    const entryPolicy = {
      ...policy,
      layout: { ...policy.layout, entryPoints: ['lib/tools/run.mjs'] },
    };
    const config = await loadDefaultConfig<ConfigEntry[]>(
      'eslint-config/policies/logging.config.mjs',
      entryPolicy,
    );

    expect(config.at(-1)).toEqual({
      files: ['lib/tools/run.mjs'],
      rules: {
        'nitpicker/report-module-load-effects': 'off',
        'nitpicker/no-production-console': ['error', { allowStandardStreams: true }],
      },
    });
  });
  it('production policy configs skip the module-load rule for the detected framework entry', async () => {
    const entryPolicy = {
      ...policy,
      layout: { ...policy.layout, entryPoints: ['lib/tools/run.mjs'] },
      frameworks: { defaultExports: [], entryPoints: ['src/main.tsx'] },
    };
    const config = await loadConfig(
      'eslint-config/policies/base.mjs',
      entryPolicy,
      buildProduction,
    );

    expect(config.at(-1)).toEqual({
      files: ['lib/tools/run.mjs', 'src/main.tsx'],
      rules: { 'nitpicker/report-module-load-effects': 'off' },
    });
  });
  it('crap.config.mjs measures the custom source roots and skips excluded paths', async () => {
    const config = await loadDefaultConfig<ToolConfig>('defaults/crap.config.mjs', policy);
    expect(config.sourcePaths).toEqual(['lib']);
    expect(sortedUnique(config.excludes)).toEqual([
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
    const config = await loadDefaultConfig<ToolConfig>('defaults/stryker.config.mjs', policy);
    expect(sortedUnique(config.mutate)).toEqual([
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
    const colocated = { ...policy, layout: { ...policy.layout, colocatedTests: true as const } };
    const crap = await loadDefaultConfig<ToolConfig>('defaults/crap.config.mjs', colocated);
    const separateCrap = await loadDefaultConfig<ToolConfig>('defaults/crap.config.mjs', policy);
    expect(crap.excludes.filter((glob) => !separateCrap.excludes.includes(glob))).toEqual([
      'lib/**/test-support/**',
    ]);
    const stryker = await loadDefaultConfig<ToolConfig>('defaults/stryker.config.mjs', colocated);
    const separateStryker = await loadDefaultConfig<ToolConfig>(
      'defaults/stryker.config.mjs',
      policy,
    );
    expect(stryker.mutate.filter((glob) => !separateStryker.mutate.includes(glob))).toEqual([
      '!lib/**/test-support/**',
    ]);
  });
  it('dependency-cruiser.config.mjs rules and exclusions use the custom roots', async () => {
    const config = await loadDefaultConfig<ToolConfig>(
      'defaults/dependency-cruiser.config.mjs',
      policy,
    );
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
