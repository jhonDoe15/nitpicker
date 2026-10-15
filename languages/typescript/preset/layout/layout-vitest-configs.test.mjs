import { afterAll, describe, expect, it } from 'vitest';
import {
  customPolicy as policy,
  removeTemporaryRoots,
  resolveVitestConfig,
} from './test-support/layout-config-helpers.mjs';

afterAll(removeTemporaryRoots);

describe('copied vitest configs', () => {
  it('the copied vitest configs run the custom roots and skip excluded paths', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', policy);
    const [unit, integration] = coverage.test.projects.map(({ test }) => test);
    expect(unit.include).toEqual([
      'lib/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(unit.exclude)].sort()).toEqual([
      '**/.git/**',
      '**/node_modules/**',
      'lib/legacy/**',
    ]);
    expect(integration.include).toEqual([
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(integration.exclude)].sort()).toEqual([
      '**/.git/**',
      '**/node_modules/**',
      'lib/legacy/**',
    ]);
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect([...new Set(coverage.test.coverage.exclude)].sort()).toEqual([
      '**/*.d.ts',
      '**/build/**',
      '**/dist/**',
      '**/generated/**',
      'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/__tests__/**',
      'lib/legacy/**',
      'lib/main/vitest.config.ts',
      'lib/vitest.config.ts',
    ]);
  });
  it('the copied vitest configs keep the default roots without a policy', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', undefined);
    expect(coverage.test.maxWorkers).toBe(4);
    expect(coverage.test.projects.map(({ test }) => test.restoreMocks)).toEqual([true, true]);
    expect(coverage.test.projects[0].test.include).toEqual([
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(coverage.test.projects[1].test.include)].sort()).toEqual([
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
    expect(coverage.test.include).toEqual([
      'tests/**/*.test.tsx',
      'lib/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(coverage.test.exclude)].sort()).toEqual([
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
});
