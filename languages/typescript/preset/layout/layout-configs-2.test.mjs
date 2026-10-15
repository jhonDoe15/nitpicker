import { resolveHeadPolicy } from '../head-policy.mjs';
import {
  expectedOutput431_33,
  expectedOutput432_67,
  expectedOutput439_64,
  expectedOutput440_64,
  expectedOutput462_29,
  expectedOutput463_29,
  expectedOutput468_27,
  expectedOutput469_27,
  expectedOutput470_27,
  expectedOutput502_26,
  expectedOutput507_33,
  expectedOutput509_44,
  expectedOutput520_52,
  expectedOutput558_35,
} from '../../../../core/diff/fixtures/expected-output/languages-typescript-preset-layout-configs.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const FILE_SELECTION = (module) => module.default.map(({ files, ignores }) => ({ files, ignores }));

// Config modules read the head policy once, at import time. Each distinct policy therefore gets
// its own module instance (a unique query string), while shared dependencies such as
// typescript-eslint load once per test file instead of once per process.
let policyImportCount = 0;

async function loadConfig(relativePath, policy, read = (module) => module.default) {
  const restore = setPolicyEnvironment(policy);
  try {
    policyImportCount += 1;
    const url = pathToFileURL(path.join(new URL('../', import.meta.url).pathname, relativePath));
    url.search = `policy=${String(policyImportCount)}`;
    return read(await import(url.href));
  } finally {
    restore();
  }
}

function temporaryProject(files) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-'));
  temporaryRoots.push(projectRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(projectRoot, name), text);
  }
  return projectRoot;
}

// The copied Vitest configs are functions that look for the project's own config in the
// directory Vitest runs in, so each call runs in a fresh project directory.
async function resolveVitestConfig(relativePath, policy, projectFiles = {}) {
  const config = await loadConfig(relativePath, policy);
  const projectRoot = temporaryProject(projectFiles);
  const restorePolicy = setPolicyEnvironment(policy);
  const previousDirectory = process.cwd();
  process.chdir(projectRoot);
  try {
    return await config({ command: 'serve', mode: 'test' });
  } finally {
    process.chdir(previousDirectory);
    restorePolicy();
  }
}

function setPolicyEnvironment(policy) {
  const previous = process.env.NITPICKER_POLICY;
  if (policy === undefined) {
    delete process.env.NITPICKER_POLICY;
  } else {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-config-'));
    temporaryRoots.push(root);
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(resolveHeadPolicy(policy)));
    process.env.NITPICKER_POLICY = policyFile;
  }
  return () => {
    if (previous === undefined) {
      delete process.env.NITPICKER_POLICY;
    } else {
      process.env.NITPICKER_POLICY = previous;
    }
  };
}

describe('package-owned child configs', () => {
  const policy = {
    exclude: ['lib/legacy/**'],
    layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
  };
  it('eslint-config/base.mjs and coding-standards.mjs follow the same layout', async () => {
    for (const relativePath of ['eslint-config/coding-standards.mjs']) {
      const config = await loadConfig(relativePath, policy, FILE_SELECTION);
      expect([...new Set(config[0].ignores)].sort()).toEqual(expectedOutput431_33());
      expect([...new Set(config.flatMap((entry) => entry.files ?? []).flat())].sort()).toEqual(
        expectedOutput432_67(),
      );
    }
    const production = await loadConfig('eslint-config/base.mjs', policy, (module) =>
      module.productionPolicyConfig({}).map(({ ignores }) => ({ ignores })),
    );
    expect([...new Set(production.flatMap((entry) => entry.ignores ?? []))].sort()).toEqual(
      expectedOutput439_64(),
    );
    expect([...new Set(production.flatMap((entry) => entry.ignores ?? []))].sort()).toEqual(
      expectedOutput440_64(),
    );
  });
  it('production policy configs skip the module-load rule for configured entry points', async () => {
    const entryPolicy = {
      ...policy,
      layout: { ...policy.layout, entryPoints: ['lib/tools/run.mjs'] },
    };
    const build = (module) => module.productionPolicyConfig({});
    const plain = await loadConfig('eslint-config/base.mjs', policy, build);
    const withEntries = await loadConfig('eslint-config/base.mjs', entryPolicy, build);

    expect(plain.some((entry) => entry.files?.includes('lib/tools/run.mjs'))).toBe(false);
    expect(withEntries.at(-1)).toEqual({
      files: ['lib/tools/run.mjs'],
      rules: { 'nitpicker/report-module-load-effects': 'off' },
    });
  });
  it('crap.config.mjs measures the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/crap.config.mjs', policy);
    expect(config.sourcePaths).toEqual(['lib']);
    expect([...new Set(config.excludes)].sort()).toEqual(expectedOutput462_29());
    expect([...new Set(config.excludes)].sort()).toEqual(expectedOutput463_29());
  });
  it('stryker.config.mjs mutates the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/stryker.config.mjs', policy);
    expect([...new Set(config.mutate)].sort()).toEqual(expectedOutput468_27());
    expect([...new Set(config.mutate)].sort()).toEqual(expectedOutput469_27());
    expect([...new Set(config.mutate)].sort()).toEqual(expectedOutput470_27());
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
  it('the copied vitest configs run the custom roots and skip excluded paths', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', policy);
    const [unit, integration] = coverage.test.projects.map(({ test }) => test);
    expect(unit.include).toEqual([
      'lib/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'lib/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(unit.exclude)].sort()).toEqual(expectedOutput502_26());
    expect(integration.include).toEqual([
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(integration.exclude)].sort()).toEqual(expectedOutput507_33());
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect([...new Set(coverage.test.coverage.exclude)].sort()).toEqual(expectedOutput509_44());
  });
  it('the copied vitest configs keep the default roots without a policy', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', undefined);
    expect(coverage.test.maxWorkers).toBe(4);
    expect(coverage.test.projects.map(({ test }) => test.restoreMocks)).toEqual([true, true]);
    expect(coverage.test.projects[0].test.include).toEqual([
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect([...new Set(coverage.test.projects[1].test.include)].sort()).toEqual(
      expectedOutput520_52(),
    );
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
    expect([...new Set(coverage.test.exclude)].sort()).toEqual(expectedOutput558_35());
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
