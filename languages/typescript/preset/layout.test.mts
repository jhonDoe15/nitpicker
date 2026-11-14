import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { prettierExclusions } from '../../../core/fix/extensions.mjs';
import { fieldOf, parseJson, textOf, textsOf } from '../../../shared/values/readers.mts';
import { readLayout as untypedReadLayout } from './head-policy.mjs';
import {
  builtInExcludedGlobs as untypedBuiltInExcludedGlobs,
  defaultResolvedLayout as untypedDefaultResolvedLayout,
  globMatcher as untypedGlobMatcher,
  sourceGlobs as untypedSourceGlobs,
  testGlobs as untypedTestGlobs,
  isSourceFile as untypedIsSourceFile,
  isTestFile as untypedIsTestFile,
  resolveLayoutFor,
  sourceRoot as untypedSourceRoot,
  testRoots as untypedTestRoots,
} from './layout.mjs';

const builtInExcludedGlobs = textsOf(untypedBuiltInExcludedGlobs);
const defaultResolvedLayout = {
  excludedGlobs: textsOf(untypedDefaultResolvedLayout.excludedGlobs),
  runtimeExcludedGlobs: textsOf(untypedDefaultResolvedLayout.runtimeExcludedGlobs),
};
const globMatcher: (glob: string) => RegExp = untypedGlobMatcher;
const sourceGlobs = textsOf(untypedSourceGlobs);
const testGlobs = textsOf(untypedTestGlobs);
const isSourceFile: (file: string) => boolean = untypedIsSourceFile;
const isTestFile: (file: string) => boolean = untypedIsTestFile;
const sourceRoot = textOf(untypedSourceRoot);
const testRoots = textsOf(untypedTestRoots);
const readLayout: (environment: NodeJS.ProcessEnv) => { readonly entryPoints: readonly string[] } =
  untypedReadLayout;

const layoutFor: (policy?: {
  layout?: { testRoots?: string[]; excludedGlobs?: string[] };
  exclude?: string[];
  generatedFiles?: string[];
}) => ReturnType<typeof resolveLayoutFor> = resolveLayoutFor;

function readConfig(name: string): unknown {
  return parseJson(readFileSync(path.join(import.meta.dirname, 'defaults', name), 'utf8'));
}

describe('common layout', () => {
  it('keeps JSON-only tool configurations aligned with the layout', () => {
    const typecheck = readConfig('tsconfig.quality.json');
    const stryker = readConfig('tsconfig.stryker.json');
    const duplicates = readConfig('jscpd.json');
    const knip = readConfig('knip.json');
    const roots = [sourceRoot, ...testRoots];
    const includes = roots.map((root) => `${root}/**/*`);
    expect(textsOf(fieldOf(typecheck, 'include')).sort()).toEqual(
      [...includes, 'vitest*.ts'].sort(),
    );
    expect(textsOf(fieldOf(stryker, 'include')).sort()).toEqual(
      [...includes.filter((glob) => glob !== 'e2e/**/*'), 'stryker.vitest.config.ts'].sort(),
    );
    expect(
      roots.map((root) =>
        textsOf(fieldOf(knip, 'project')).some((glob) => glob.startsWith(`${root}/**/`)),
      ),
    ).toEqual(roots.map(() => true));
    const duplicatePaths = textsOf(fieldOf(duplicates, 'path'));
    expect(duplicatePaths).toContain(sourceRoot);
    expect(duplicatePaths).toContain(String(testRoots[0]));
  });
  it('keeps the output folders of every tool config equal to the built-in exclusions', () => {
    const defaults = path.join(import.meta.dirname, 'defaults');
    const read = (name: string) => readFileSync(path.join(defaults, name), 'utf8');
    const outputGlobs = (globs: readonly string[]) =>
      globs.filter((glob) => /^\*{0,2}\/?\w+(?:\/\w+)*\/\*\*$/u.test(glob));
    const builtIn = [...builtInExcludedGlobs].sort();

    const tsconfigs = ['tsconfig.quality.json', 'tsconfig.stryker.json'];
    expect(
      tsconfigs.map((name) => textsOf(fieldOf(parseJson(read(name)), 'exclude')).sort()),
    ).toEqual(tsconfigs.map(() => builtIn));
    expect(outputGlobs(textsOf(fieldOf(parseJson(read('jscpd.json')), 'ignore'))).sort()).toEqual(
      builtIn,
    );
    const knipGlobs = outputGlobs(textsOf(fieldOf(parseJson(read('knip.json')), 'ignore')));
    expect(knipGlobs).not.toHaveLength(0);
    expect(knipGlobs.filter((glob) => !builtIn.includes(glob))).toEqual([]);
    const vitestGlobs = [...read('vitest.quality.config.ts').matchAll(/'(\w+\/\*\*)'/gu)].map(
      ([, glob]) => String(glob),
    );
    expect(vitestGlobs).not.toHaveLength(0);
    expect(vitestGlobs.filter((glob) => !builtIn.includes(glob))).toEqual([]);
  });
  it('selects both conventional source and test locations without treating colocated tests as source', () => {
    expect([...new Set(sourceGlobs)].sort()).toEqual(['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']);
    expect([...new Set(testGlobs)].sort()).toEqual([
      '__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'test/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
    const tests = ['test/service.test.ts', 'tests/service.test.ts', 'src/service.spec.ts'];
    expect(tests.map((file) => [isTestFile(file), isSourceFile(file)])).toEqual(
      tests.map(() => [true, false]),
    );
    expect(isSourceFile('src/service.ts')).toBe(true);
    expect(isSourceFile('src/main/features/service.ts')).toBe(true);
    expect(isSourceFile('src/generated/service.ts')).toBe(true);
    expect(isSourceFile('src/main/features/reports/domain/service.ts')).toBe(true);
    expect(isSourceFile('generated/service.ts')).toBe(false);
    expect(isSourceFile('src/service.d.ts')).toBe(false);
  });
});

describe('built-in excluded globs', () => {
  it('match build output folders only at the project root', () => {
    const matches = (file: string) =>
      defaultResolvedLayout.excludedGlobs.some((glob) => globMatcher(glob).test(file));

    const folders = ['dist', 'build', 'generated', 'coverage', 'reports/quality', 'target'];
    expect(
      folders.map((folder) => [
        matches(`${folder}/a.ts`),
        matches(`src/main/features/${folder}/domain/a.ts`),
      ]),
    ).toEqual(folders.map(() => [true, false]));
    expect(matches('reports/monthly.ts')).toBe(false);
    expect(matches('src/reports/monthly.ts')).toBe(false);
    expect(matches('src/node_modules/pkg/a.ts')).toBe(true);
  });

  it('format folders named like an output folder unless they are the root output folder', async () => {
    const ignorePath = path.join(import.meta.dirname, 'defaults/.prettierignore');
    const ignored = async (file: string) =>
      (await prettier.getFileInfo(path.join(import.meta.dirname, 'defaults', file), { ignorePath }))
        .ignored;
    const fixExcluded = (file: string) => prettierExclusions.some((pattern) => pattern.test(file));
    const files = [
      'reports/quality/diff/a.json',
      'coverage/a.json',
      '.stryker-tmp/a.ts',
      'reports/monthly.ts',
      'src/reports/monthly.ts',
      'src/coverage/a.ts',
    ];
    const results = await Promise.all(
      files.map(async (file) => [file, await ignored(file), fixExcluded(file)]),
    );
    expect(results).toEqual([
      ['reports/quality/diff/a.json', true, true],
      ['coverage/a.json', true, true],
      ['.stryker-tmp/a.ts', true, true],
      ['reports/monthly.ts', false, false],
      ['src/reports/monthly.ts', false, false],
      ['src/coverage/a.ts', false, false],
    ]);
  });

  it('lint and type-check hand-written declaration files but keep them out of runtime checks', () => {
    expect(defaultResolvedLayout.excludedGlobs).not.toContain('**/*.d.ts');
    expect(defaultResolvedLayout.runtimeExcludedGlobs).toEqual([
      ...defaultResolvedLayout.excludedGlobs,
      '**/*.d.ts',
    ]);
    const quality = readConfig('tsconfig.quality.json');
    expect(textsOf(fieldOf(quality, 'exclude'))).not.toContain('**/*.d.ts');
    expect(fieldOf(fieldOf(quality, 'compilerOptions'), 'noEmit')).toBe(true);
    expect(textsOf(fieldOf(readConfig('tsconfig.stryker.json'), 'exclude'))).not.toContain(
      '**/*.d.ts',
    );
  });
});

describe('generated files', () => {
  const NAMED_LIKE_GENERATED = [
    'src/api.generated.ts',
    'src/schema.gen.tsx',
    'src/__generated__/types.ts',
    'src/proto/user_pb.js',
    'src/proto/user_grpc_pb.ts',
    'src/proto/user.pb.ts',
  ];

  it.each(NAMED_LIKE_GENERATED)('are source code without a generator marker: %s', (file) => {
    expect(isSourceFile(file)).toBe(true);
  });

  it.each(NAMED_LIKE_GENERATED)('are generated when they carry a marker: %s', (file) => {
    const layout = layoutFor({ generatedFiles: [file] });

    expect([layout.isGeneratedPath(file), layout.isSourceFile(file)]).toEqual([true, false]);
  });

  it('keeps dependencies generated and builds the marked-file pattern for the import rules', () => {
    const layout = layoutFor({ generatedFiles: ['generated/api.ts'] });

    expect(layout.isGeneratedPath('src/node_modules/pkg/a.ts')).toBe(true);
    expect(layout.isGeneratedPath('dist/b.ts')).toBe(false);
    expect(new RegExp(String(layout.generatedFilePattern)).test('generated/api.ts')).toBe(true);
    expect(new RegExp(String(layout.generatedFilePattern)).test('generated/api.tsx')).toBe(false);
    expect(layoutFor().generatedFilePattern).toBeUndefined();
  });
});

describe('layout.isTestPath', () => {
  it('recognizes any file under a test folder, whatever its extension', () => {
    const layout = layoutFor();

    expect(layout.isTestPath('src/ui/__tests__/logo.svg')).toBe(true);
    expect(layout.isTestPath('tests/logo.svg')).toBe(true);
    expect(layout.isTestPath('src/ui/logo.svg')).toBe(false);
  });
});

describe('repo-root test folders', () => {
  it.each([
    '__tests__/panel.test.tsx',
    '__tests__/ui/panel.tsx',
    'e2e/checkout.spec.ts',
    'e2e/support/page.ts',
    'src/ui/__tests__/panel.tsx',
  ])('treats %s as a test file, not source', (file) => {
    expect(isTestFile(file)).toBe(true);
    expect(isSourceFile(file)).toBe(false);
  });

  it('lists both folders as default test roots and selects their code files', () => {
    expect(testRoots).toEqual(['test', 'tests', '__tests__', 'e2e']);
    expect(testGlobs).toEqual([
      'test/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'tests/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      '__tests__/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ]);
  });

  it('does not treat a nested e2e or __tests__ folder outside a root as a test folder', () => {
    expect(isTestFile('lib/e2e/helper.ts')).toBe(false);
    expect(isTestFile('docs/e2e/example.ts')).toBe(false);
  });

  it('keeps a configured test root list as given', () => {
    const layout = layoutFor({ layout: { testRoots: ['spec'] } });

    expect(layout.isTestFile('e2e/checkout.spec.ts')).toBe(false);
    expect(layout.isTestFile('spec/panel.ts')).toBe(true);
  });
});

describe('layout.excludedGlobs', () => {
  it('replaces the built-in excluded globs and keeps the config exclude globs', () => {
    const layout = layoutFor({
      layout: { excludedGlobs: ['**/vendor/**'] },
      exclude: ['legacy/**'],
    });

    expect(layout.excludedGlobs).toEqual(['**/vendor/**', 'legacy/**']);
  });

  it('hides the files it lists from every check, like exclude', () => {
    const layout = layoutFor({
      layout: { excludedGlobs: ['dist/**', 'src/hidden/**'] },
      exclude: ['src/vendor/**'],
    });

    expect(layout.isSourceFile('src/hidden/big.ts')).toBe(false);
    expect(layout.isExcluded('src/hidden/big.ts')).toBe(true);
    expect(layout.isExcluded('src/vendor/a.ts')).toBe(true);
    expect(new RegExp(String(layout.excludePattern)).test('src/hidden/big.ts')).toBe(true);
    expect(layout.isSourceFile('src/shown.ts')).toBe(true);
  });
});

describe('the layout read from the head policy file', () => {
  it('is resolved once per policy content and again when the file changes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-policy-'));
    const environment = { NITPICKER_POLICY: path.join(root, 'policy.json') };
    try {
      writeFileSync(environment.NITPICKER_POLICY, '{"layout":{"entryPoints":["a.mjs"]}}');
      const first = readLayout(environment);
      expect(readLayout(environment)).toBe(first);
      writeFileSync(environment.NITPICKER_POLICY, '{"layout":{"entryPoints":["b.mjs"]}}');
      expect(readLayout(environment).entryPoints).toEqual(['b.mjs']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
