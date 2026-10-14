import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { linkPolicyFile } from '../../../core/tooling/policy-links.mjs';
import { globToRegExp, resolveLayout } from './layout.mjs';
import {
  isCustomLayout,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutStrykerTsconfig,
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
    expect(layout.testRoots).toEqual(['test', 'tests', '__tests__', 'e2e']);
    expect(layout.graphIncludeOnly).toBe('^(src|test|tests|__tests__|e2e)(?:/|$)');
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
    const rewrites = {
      'tsconfig.quality.json': layoutTsconfig,
      'tsconfig.stryker.json': layoutStrykerTsconfig,
    };
    for (const [name, rewrite] of Object.entries(rewrites)) {
      const base = readDefault(name);
      const rewritten = rewrite(base, defaultLayout);
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

  it('copy the shipped tsconfig, rewritten for the layout, when the project has none', () => {
    const projectRoot = temporaryProject({});
    const shipped = readFileSync(path.join(defaults, 'tsconfig.quality.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-diff-tsconfig.json');
    expect(layoutTransformFor('tsconfig.quality.json', defaultLayout)(shipped, target)).toBe(
      shipped,
    );
    const custom = JSON.parse(
      layoutTransformFor('tsconfig.quality.json', customLayout)(shipped, target),
    );
    expect(custom.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
  });

  it('extend the project tsconfig with the policy flags for type checking', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const transform = layoutTransformFor('tsconfig.quality.json', customLayout);
    const shipped = readFileSync(path.join(defaults, 'tsconfig.quality.json'), 'utf8');
    const layered = JSON.parse(transform(shipped, path.join(projectRoot, '.nitpicker-x.json')));
    expect(layered.extends).toBe('./tsconfig.json');
    expect(layered.compilerOptions).toMatchObject({
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
    });
    expect(layered.compilerOptions).not.toHaveProperty('module');
    expect(layered.compilerOptions).not.toHaveProperty('jsx');
    expect(layered.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect(layered.exclude).toContain('lib/legacy/**');
  });

  describe('over a solution-style project tsconfig', () => {
    const appConfig = `{
      // Bundler mode
      "compilerOptions": { "jsx": "react-jsx", "module": "ESNext", "moduleResolution": "bundler" },
      "include": ["src"]
    }`;
    const nodeConfig =
      '{ "compilerOptions": { "module": "ESNext" }, "include": ["vite.config.ts"] }';
    const solution = (...paths) =>
      JSON.stringify({ files: [], references: paths.map((reference) => ({ path: reference })) });

    function layeredFor(files, name = 'tsconfig.quality.json') {
      const projectRoot = temporaryProject(files);
      const shipped = readFileSync(path.join(defaults, name), 'utf8');
      const target = path.join(projectRoot, '.nitpicker-x.json');
      const layered = layoutTransformFor(name, defaultLayout)(shipped, target);
      writeFileSync(target, layered);
      return { layered: JSON.parse(layered), target };
    }

    it('extends the referenced config that includes the source roots, so its compiler options apply', () => {
      const { layered, target } = layeredFor({
        'tsconfig.json': solution('./tsconfig.node.json', './tsconfig.app.json'),
        'tsconfig.app.json': appConfig,
        'tsconfig.node.json': nodeConfig,
      });

      expect(layered.extends).toBe('./tsconfig.app.json');
      const parsed = ts.getParsedCommandLineOfConfigFile(
        target,
        {},
        { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
      );
      expect(parsed.options.jsx).toBe(ts.JsxEmit.ReactJSX);
    });

    it('follows a reference to a directory, for the mutation tsconfig too', () => {
      const projectRoot = temporaryProject({ 'tsconfig.json': solution('./app') });
      mkdirSync(path.join(projectRoot, 'app'));
      writeFileSync(path.join(projectRoot, 'app', 'tsconfig.json'), appConfig);
      const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');

      const mutation = JSON.parse(
        layoutTransformFor('tsconfig.stryker.json', defaultLayout)(
          shipped,
          path.join(projectRoot, '.nitpicker-x.json'),
        ),
      );

      expect(mutation.extends).toBe('./app/tsconfig.json');
    });

    it.each([
      [
        'no reference includes a source root',
        { 'tsconfig.json': solution('./tsconfig.node.json'), 'tsconfig.node.json': nodeConfig },
      ],
      ['the referenced file is missing', { 'tsconfig.json': solution('./tsconfig.app.json') }],
      [
        'the project config has compiler options of its own',
        {
          'tsconfig.json': JSON.stringify({
            compilerOptions: { strict: true, types: [], lib: ['ES2022'] },
            references: [{ path: './tsconfig.app.json' }],
          }),
          'tsconfig.app.json': appConfig,
        },
      ],
    ])('keeps extending the project tsconfig when %s', (_name, files) => {
      expect(layeredFor(files).layered.extends).toBe('./tsconfig.json');
    });
  });

  it('type-check mutants with the policy compiler options on top of the project tsconfig', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-x.json');
    const strict = JSON.parse(
      layoutTransformFor('tsconfig.stryker.json', defaultLayout)(shipped, target),
    );
    expect(strict.extends).toBe('./tsconfig.json');
    const {
      skipLibCheck,
      noImplicitReturns,
      noFallthroughCasesInSwitch,
      noUncheckedIndexedAccess,
    } = strict.compilerOptions;
    expect({
      skipLibCheck,
      strict: strict.compilerOptions.strict,
      noImplicitReturns,
      noFallthroughCasesInSwitch,
      noUncheckedIndexedAccess,
    }).toEqual({
      skipLibCheck: true,
      strict: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
    });
    expect(strict.compilerOptions).not.toHaveProperty('module');
    const relaxed = layoutTransformFor('tsconfig.stryker.json', defaultLayout, {
      strictMutants: false,
    })(shipped, target);
    expect(JSON.parse(relaxed)).toEqual({
      extends: './tsconfig.json',
      compilerOptions: { skipLibCheck: true },
    });
  });

  it('ship the mutation tsconfig with the same indexing and return checks as the type check', () => {
    const quality = readDefault('tsconfig.quality.json').compilerOptions;
    const stryker = readDefault('tsconfig.stryker.json').compilerOptions;
    for (const option of [
      'strict',
      'noImplicitReturns',
      'noFallthroughCasesInSwitch',
      'noUncheckedIndexedAccess',
    ]) {
      expect(stryker[option]).toBe(quality[option]);
    }
  });

  it('drop only the extra strictness from the shipped mutation tsconfig when relaxed', () => {
    const projectRoot = temporaryProject({});
    const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
    const target = path.join(projectRoot, '.nitpicker-x.json');
    const relaxed = JSON.parse(
      layoutTransformFor('tsconfig.stryker.json', customLayout, { strictMutants: false })(
        shipped,
        target,
      ),
    );
    const { noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, ...kept } =
      readDefault('tsconfig.stryker.json').compilerOptions;
    expect([noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess]).toEqual([
      true,
      true,
      true,
    ]);
    expect(relaxed.compilerOptions).toEqual(kept);
    expect(relaxed.include).toEqual(['lib/**/*', 'spec/**/*', 'stryker.vitest.config.ts']);
  });

  it.each([
    [
      'removing ?. from an indexed access',
      'export const text = (rows: { text: string }[]): string | undefined => rows[0]?.text;\n',
      'export const text = (rows: { text: string }[]): string | undefined => rows[0].text;\n',
    ],
    [
      'removing a default branch that returns undefined',
      "export const label = (kind: string): string | undefined => {\n  switch (kind) {\n    case 'a':\n      return 'A';\n    default:\n      return undefined;\n  }\n};\n",
      "export const label = (kind: string): string | undefined => {\n  switch (kind) {\n    case 'a':\n      return 'A';\n    default:\n  }\n};\n",
    ],
  ])(
    'reject a mutant made by %s as a compile error, while the original compiles',
    (_name, original, mutant) => {
      const projectTsconfig = JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022'],
          types: [],
        },
        include: ['src'],
      });
      const compileErrors = (source, options) => {
        const projectRoot = temporaryProject({ 'tsconfig.json': projectTsconfig });
        mkdirSync(path.join(projectRoot, 'src'));
        writeFileSync(path.join(projectRoot, 'src', 'mutated.ts'), source);
        const shipped = readFileSync(path.join(defaults, 'tsconfig.stryker.json'), 'utf8');
        const configPath = path.join(projectRoot, 'tsconfig.stryker.json');
        writeFileSync(
          configPath,
          layoutTransformFor('tsconfig.stryker.json', defaultLayout, options)(shipped, configPath),
        );
        const parsed = ts.getParsedCommandLineOfConfigFile(
          configPath,
          {},
          { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
        );
        return ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
      };

      expect(compileErrors(original, { strictMutants: true })).toEqual([]);
      expect(compileErrors(mutant, { strictMutants: true })).not.toEqual([]);
      expect(compileErrors(mutant, { strictMutants: false })).toEqual([]);
    },
  );

  it('link through a real policy file installs the layered tsconfig', () => {
    const projectRoot = temporaryProject({ 'tsconfig.json': '{}' });
    const linked = linkPolicyFile(
      path.join(defaults, 'tsconfig.quality.json'),
      path.join(projectRoot, '.nitpicker-diff-tsconfig.json'),
      layoutTransformFor('tsconfig.quality.json', defaultLayout),
    );
    try {
      expect(JSON.parse(readFileSync(linked.targetPath, 'utf8')).extends).toBe('./tsconfig.json');
    } finally {
      linked.remove();
    }
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
    expect(jscpd.path).toEqual(['lib', 'spec']);
    expect(jscpd.ignore).toContain('lib/legacy/**');
  });

  it('add the configured entry points to the knip entries', () => {
    const layout = { ...customLayout, entryPoints: ['lib/tools/*-runner.mjs'] };

    const knip = layoutKnipConfig(readDefault('knip.json'), layout);

    expect(knip.entry).toContain('lib/main.ts');
    expect(knip.entry).toContain('lib/tools/*-runner.mjs');
  });

  it('count entry points as a custom layout', () => {
    expect(isCustomLayout({ ...resolveLayout(), entryPoints: ['tools/run.mjs'] })).toBe(true);
    expect(isCustomLayout(resolveLayout())).toBe(false);
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
    expect(config.excludes).toContain('lib/legacy/**');
    expect(config.excludes).toContain('spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
  });

  it('stryker.config.mjs mutates the custom source roots and skips excluded paths', async () => {
    const config = await loadConfig('defaults/stryker.config.mjs', policy);
    expect(config.mutate).toContain('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}');
    expect(config.mutate).toContain('!lib/legacy/**');
    expect(config.mutate).toContain('!lib/**/__tests__/**');
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
    expect(unit.exclude).toContain('lib/legacy/**');
    expect(integration.include).toEqual([
      'spec/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'spec/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(integration.exclude).toContain('lib/legacy/**');
    expect(coverage.test.coverage.include).toEqual(['lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect(coverage.test.coverage.exclude).toContain('lib/legacy/**');
  });

  it('the copied vitest configs keep the default roots without a policy', async () => {
    const coverage = await resolveVitestConfig('defaults/vitest.quality.config.ts', undefined);
    expect(coverage.test.maxWorkers).toBe(4);
    expect(coverage.test.projects.map(({ test }) => test.restoreMocks)).toEqual([true, true]);
    expect(coverage.test.projects[0].test.include).toEqual([
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    expect(coverage.test.projects[1].test.include).toContain(
      'tests/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
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
    expect(coverage.test.exclude).toContain('lib/legacy/**');
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

const FILE_SELECTION = (module) => module.default.map(({ files, ignores }) => ({ files, ignores }));

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

function temporaryProject(files) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-'));
  temporaryRoots.push(projectRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(projectRoot, name), text);
  }
  return projectRoot;
}

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
