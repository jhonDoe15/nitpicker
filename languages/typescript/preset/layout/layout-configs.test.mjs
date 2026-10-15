import {
  expectedOutput57_40,
  expectedOutput157_37,
  expectedOutput168_29,
  expectedOutput380_30,
  expectedOutput383_24,
  expectedOutput384_24,
  expectedOutput385_26,
  expectedOutput387_25,
  expectedOutput391_26,
  expectedOutput399_24,
  expectedOutput400_24,
  expectedOutput420_21,
  expectedOutput422_19,
  expectedOutput423_19,
  expectedOutput424_19,
} from '../../../../core/diff/fixtures/expected-output/languages-typescript-preset-layout-configs.mjs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { linkPolicyFile } from '../../../../core/tooling/policy-links.mjs';
import { globToRegExp, resolveLayout } from '../layout.mjs';
import {
  isCustomLayout,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutTransformFor,
  layoutTsconfig,
} from '../tool-configs.mjs';

const defaults = path.join(new URL('../', import.meta.url).pathname, 'defaults');

const customLayout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, [
  'lib/legacy/**',
]);

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
    expect([...new Set(customLayout.excludedGlobs)].sort()).toEqual(expectedOutput57_40());
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
    expect(layered.compilerOptions).toEqual(expectedOutput157_37());
    expect(layered.compilerOptions).not.toHaveProperty('module');
    expect(layered.compilerOptions).not.toHaveProperty('jsx');
    expect(layered.include).toEqual(['lib/**/*', 'spec/**/*', 'vitest*.ts']);
    expect([...new Set(layered.exclude)].sort()).toEqual(expectedOutput168_29());
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
    expect([...new Set(tsconfig.exclude)].sort()).toEqual(expectedOutput380_30());

    const knip = layoutKnipConfig(readDefault('knip.json'), customLayout);
    expect([...new Set(knip.entry)].sort()).toEqual(expectedOutput383_24());
    expect([...new Set(knip.entry)].sort()).toEqual(expectedOutput384_24());
    expect([...new Set(knip.project)].sort()).toEqual(expectedOutput385_26());
    expect([...knip.entry, ...knip.project, ...knip.ignore].join(' ')).not.toMatch(/\bsrc\//);
    expect([...new Set(knip.ignore)].sort()).toEqual(expectedOutput387_25());

    const jscpd = layoutJscpdConfig(readDefault('jscpd.json'), customLayout);
    expect(jscpd.path).toEqual(['lib', 'spec']);
    expect([...new Set(jscpd.ignore)].sort()).toEqual(expectedOutput391_26());
  });
  it('add the configured entry points to the knip entries', () => {
    const layout = { ...customLayout, entryPoints: ['lib/tools/*-runner.mjs'] };

    const knip = layoutKnipConfig(readDefault('knip.json'), layout);

    expect([...new Set(knip.entry)].sort()).toEqual(expectedOutput399_24());
    expect([...new Set(knip.entry)].sort()).toEqual(expectedOutput400_24());
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
    expect([...new Set(ignores)].sort()).toEqual(expectedOutput420_21());
    const files = config.flatMap((entry) => entry.files ?? []).flat();
    expect([...new Set(files)].sort()).toEqual(expectedOutput422_19());
    expect([...new Set(files)].sort()).toEqual(expectedOutput423_19());
    expect([...new Set(files)].sort()).toEqual(expectedOutput424_19());
    expect(files.filter((glob) => glob.startsWith('src/') || glob.startsWith('test'))).toEqual([]);
  });
});
