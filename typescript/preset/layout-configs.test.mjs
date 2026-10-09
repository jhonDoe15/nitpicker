import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { globToRegExp, resolveLayout } from './layout.mjs';
import {
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
  layoutTsconfig,
} from './tool-configs.mjs';

const defaults = path.join(import.meta.dirname, 'defaults');
const customLayout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, [
  'lib/legacy/**',
]);
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

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
    expect(customLayout.excludedGlobs).toContain('lib/legacy/**');
    expect(new RegExp(customLayout.excludePattern).test('lib/legacy/old.ts')).toBe(true);
    expect(new RegExp(customLayout.excludePattern).test('lib/live/new.ts')).toBe(false);
    expect(resolveLayout().excludePattern).toBeUndefined();
  });

  it('lists project code files under the roots without excluded files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-test-'));
    temporaryRoots.push(root);
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
  const readDefault = (name) => JSON.parse(readFileSync(path.join(defaults, name), 'utf8'));
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
    for (const name of ['tsconfig.quality.json', 'knip.json', 'jscpd.json']) {
      expect(layoutTransformFor(name, defaultLayout)).toBeUndefined();
    }
    expect(layoutTransformFor('tsconfig.quality.json', customLayout)).toBeTypeOf('function');
    expect(layoutTransformFor('stryker.vitest.config.ts', customLayout)).toBeUndefined();
  });

  it('move the roots and add the exclude globs for a custom layout', () => {
    const tsconfig = layoutTsconfig(readDefault('tsconfig.quality.json'), customLayout);
    expect(tsconfig.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect(tsconfig.exclude).toContain('lib/legacy/**');

    const knip = layoutKnipConfig(readDefault('knip.json'), customLayout);
    expect(knip.entry).toContain('lib/main.ts');
    expect(knip.entry).toContain('spec/fixtures/*harness*.{ts,mts,mjs}');
    expect(knip.project).toContain('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect([...knip.entry, ...knip.project, ...knip.ignore].join(' ')).not.toMatch(/\bsrc\//);
    expect(knip.ignore).toContain('lib/legacy/**');

    const jscpd = layoutJscpdConfig(readDefault('jscpd.json'), customLayout);
    expect(jscpd.path).toEqual(['lib']);
    expect(jscpd.ignore).toContain('lib/legacy/**');
  });
});

describe('package-owned child configs', () => {
  const policy = {
    exclude: ['lib/legacy/**'],
    layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
  };

  it('eslint.config.mjs lints the custom roots and ignores excluded paths', async () => {
    const config = await loadConfig('defaults/eslint.config.mjs', policy, FILE_SELECTION);
    const ignores = config.flatMap((entry) =>
      entry.files === undefined ? (entry.ignores ?? []) : [],
    );
    expect(ignores).toContain('lib/legacy/**');
    const files = config.flatMap((entry) => entry.files ?? []).flat();
    expect(files).toContain('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect(files).toContain('spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect(files).toContain('spec/unit/**/*.ts');
    expect(files.filter((glob) => glob.startsWith('src/') || glob.startsWith('test'))).toEqual([]);
  });

  it('eslint-config/base.mjs and coding-standards.mjs follow the same layout', async () => {
    for (const relativePath of ['eslint-config/coding-standards.mjs']) {
      const config = await loadConfig(relativePath, policy, FILE_SELECTION);
      expect(config[0].ignores).toContain('lib/legacy/**');
      expect(config.flatMap((entry) => entry.files ?? []).flat()).toContain(
        'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      );
    }
    const production = await loadConfig('eslint-config/base.mjs', policy, (module) =>
      module.productionPolicyConfig({}).map(({ ignores }) => ({ ignores })),
    );
    expect(production.flatMap((entry) => entry.ignores ?? [])).toContain('lib/legacy/**');
    expect(production.flatMap((entry) => entry.ignores ?? [])).toContain('lib/**/__tests__/**');
  });

  it('crap.config.mjs measures the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/crap.config.mjs', policy);
    expect(config.sourcePaths).toEqual(['lib']);
    expect(config.excludes).toContain('lib/legacy/**');
    expect(config.excludes).toContain('spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
  });

  it('stryker.config.mjs mutates the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/stryker.config.mjs', policy);
    expect(config.mutate).toContain('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect(config.mutate).toContain('!lib/legacy/**');
    expect(config.mutate).toContain('!lib/**/__tests__/**');
    expect(config.mutate.filter((glob) => glob.includes('src/'))).toEqual([]);
    expect(config.ignorePatterns).toEqual(['lib/dist', 'spec/integration', 'reports']);
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
    const coverage = await loadConfig('defaults/vitest.quality.config.ts', policy);
    const [unit, integration] = coverage.test.projects.map(({ test }) => test);
    expect(unit.include).toEqual(['lib/**/*.test.ts', 'lib/**/*.spec.ts']);
    expect(unit.exclude).toContain('lib/legacy/**');
    expect(integration.include).toEqual(['spec/**/*.test.ts', 'spec/**/*.spec.ts']);
    expect(integration.exclude).toContain('lib/legacy/**');
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(coverage.test.coverage.exclude).toContain('lib/legacy/**');
    const mutation = await loadConfig('defaults/stryker.vitest.config.ts', policy);
    expect(mutation.test.include).toEqual([
      'lib/**/*.test.ts',
      'lib/**/*.spec.ts',
      'spec/**/*.test.ts',
    ]);
    expect(mutation.test.exclude).toContain('lib/legacy/**');
  });

  it('the copied vitest configs keep the default roots without a policy', async () => {
    const coverage = await loadConfig('defaults/vitest.quality.config.ts', undefined);
    expect(coverage.test.projects[0].test.include).toEqual([
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
    ]);
    expect(coverage.test.projects[1].test.include).toContain('tests/**/*.test.ts');
    expect(coverage.test.coverage.include).toEqual(['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
  });
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
    const url = pathToFileURL(path.join(import.meta.dirname, relativePath));
    url.search = `policy=${String(policyImportCount)}`;
    return read(await import(url.href));
  } finally {
    restore();
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
    writeFileSync(policyFile, JSON.stringify(policy));
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
