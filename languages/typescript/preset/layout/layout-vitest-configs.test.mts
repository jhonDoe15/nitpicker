import { describe, expect, it } from 'vitest';
import {
  customPolicy as policy,
  resolveVitestConfig,
} from './test-support/layout-config-loading.mts';
import { sortedUnique } from './test-support/layout-views.mts';

describe('copied vitest configs', () => {
  it('the copied vitest configs run the custom roots and skip excluded paths', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', policy);
    const [unit, integration] = (coverage.test.projects ?? []).map(({ test }) => test);
    expect(unit?.include).toEqual([
      'lib/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(sortedUnique(unit?.exclude ?? [])).toEqual([
      '**/.git/**',
      '**/node_modules/**',
      'lib/legacy/**',
    ]);
    expect(integration?.include).toEqual([
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(sortedUnique(integration?.exclude ?? [])).toEqual([
      '**/.git/**',
      '**/node_modules/**',
      'lib/legacy/**',
    ]);
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(sortedUnique(coverage.test.coverage.exclude)).toEqual([
      '**/*.d.ts',
      'build/**',
      'dist/**',
      'generated/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/__tests__/**',
      'lib/legacy/**',
      'lib/{main/,}vitest.config.ts',
    ]);
  });
  it('the copied vitest config covers the project root without sweeping output and sample folders', async () => {
    const rooted = {
      ...policy,
      layout: { ...policy.layout, sourceRoots: ['./'], testRoots: ['test'] },
    };
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', rooted);
    const { include, exclude } = coverage.test.coverage;

    expect(include).toEqual(['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(sortedUnique(exclude)).toEqual([
      '**/*.d.ts',
      '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '**/.*/**',
      '**/__tests__/**',
      'build/**',
      'dist/**',
      'generated/**',
      'lib/legacy/**',
      '{coverage,reports,target,out,public,storybook-static,tmp,temp,docs,bench{,mark,marks},example{,s}}/**',
      '{main/,}vitest.config.ts',
    ]);
    expect([...include, ...exclude].filter((glob) => glob.startsWith('./'))).toEqual([]);
  });
  it('the copied vitest config leaves test-support/ out of coverage in a colocated layout', async () => {
    const colocated = { ...policy, layout: { ...policy.layout, colocatedTests: true as const } };
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', colocated);
    const separate = await resolveVitestConfig('defaults/vitest.quality.config.ts', policy);
    expect(
      coverage.test.coverage.exclude.filter(
        (glob) => !separate.test.coverage.exclude.includes(glob),
      ),
    ).toEqual(['lib/**/test-support/**']);
  });
  it('the copied vitest configs keep the default roots without a policy', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', undefined);
    expect(coverage.test.maxWorkers).toBe(4);
    expect(coverage.test.projects?.map(({ test }) => test.restoreMocks)).toEqual([true, true]);
    expect(coverage.test.projects?.[0]?.test.include).toEqual([
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(sortedUnique(coverage.test.projects?.[1]?.test.include ?? [])).toEqual([
      '__tests__/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '__tests__/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'test/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'test/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(coverage.test.coverage.include).toEqual(['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
  });
  it('the copied vitest configs layer nitpicker roots and coverage on the project config', async () => {
    const projectConfig = [
      'export default {',
      "  resolve: { alias: { '~': '/src' } },",
      '  test: {',
      "    environment: 'jsdom',",
      "    setupFiles: ['./setup.ts'],",
      "    dir: 'tests',",
      "    include: ['tests/**/*.test.tsx'],",
      "    coverage: { provider: 'istanbul', thresholds: { lines: 100 } },",
      '  },',
      '};',
    ].join('\n');
    const projectFiles = { 'vitest.config.mjs': projectConfig };
    const coverage = await resolveVitestConfig(
      'defaults/vitest.quality.config.ts',
      policy,
      projectFiles,
    );
    expect(coverage.resolve.alias).toEqual({ '~': '/src' });
    expect(coverage.test.environment).toBe('jsdom');
    expect(coverage.test.setupFiles).toEqual(['./setup.ts']);
    expect(coverage.test.dir).toBeUndefined();
    expect(coverage.test.maxWorkers).toBe(4);
    expect(coverage.test.restoreMocks).toBe(true);
    expect(coverage.test.include).toEqual(['tests/**/*.test.tsx']);
    expect(sortedUnique(coverage.test.exclude)).toEqual([
      '**/.git/**',
      '**/node_modules/**',
      'lib/legacy/**',
    ]);
    expect(coverage.test.coverage.provider).toBe('v8');
    expect(coverage.test.coverage.thresholds).toBeUndefined();
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
  });
  it('the copied vitest configs pick up a Vite config when there is no Vitest config', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', undefined, {
      'vite.config.mjs': "export default { test: { environment: 'happy-dom' } };",
    });
    expect(coverage.test.environment).toBe('happy-dom');
    expect(coverage.test.projects).toBeUndefined();
  });
  it('a workspace member without its own config takes the workspace root config', async () => {
    const rootConfig = [
      'export default {',
      "  resolve: { alias: { '@acme/common': '/workspace/packages/common/src/index.ts' } },",
      '  test: {',
      '    globals: true,',
      "    setupFiles: ['./setup.ts', 'vitest-localstorage-mock'],",
      "    include: ['packages/**/*.test.ts'],",
      '  },',
      '};',
    ].join('\n');
    const files = {
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/common/.gitkeep': '',
      'vitest.config.mjs': rootConfig,
      'packages/common/package.json': '{}',
    };

    const coverage = await resolveVitestConfig(
      'defaults/vitest.quality.config.ts',
      policy,
      files,
      'packages/common',
    );

    expect(coverage.resolve.alias).toEqual({
      '@acme/common': '/workspace/packages/common/src/index.ts',
    });
    expect(coverage.test.globals).toBe(true);
    expect(coverage.test.setupFiles).toEqual([
      expect.stringMatching(/^(?:(?!packages).)*[/\\]setup\.ts$/u),
      'vitest-localstorage-mock',
    ]);
    expect(coverage.test.include).toEqual([
      'lib/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });
  it('a project does not take a workspace config from above its repository root', async () => {
    const coverage = await resolveVitestConfig(
      'defaults/vitest.quality.config.ts',
      policy,
      {
        'package.json': JSON.stringify({ workspaces: ['repo/*'] }),
        'vitest.config.mjs': 'export default { test: { globals: true } };',
        'repo/.git': 'gitdir: elsewhere',
        'repo/app/a.ts': '',
      },
      'repo/app',
    );

    expect(coverage.test.globals).toBeUndefined();
  });
});
