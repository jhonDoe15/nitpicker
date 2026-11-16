import { describe, expect, it } from 'vitest';
import { useTemporaryProjects } from '../../test-support/temporary-projects.mts';
import { typescriptIgnoredNotices as untypedNotices } from '../ignored-notices.mjs';
import {
  BUILD,
  COMMON,
  PRODUCTION_WITH_NODE,
  SOLUTION,
  SOURCES,
  SPEC,
  STUBS,
  diagnostics,
  json,
} from '../test-support/solution-fixtures.mts';
import {
  extendedProjectTsconfig as untypedExtendedProjectTsconfig,
  projectTsconfigFiles as untypedProjectTsconfigFiles,
} from './typescript-project-options.mjs';

type ProjectLayout = {
  javascript: boolean;
  sourceRoots: string[];
  isTestFile?: (file: string) => boolean;
};

const extendedProjectTsconfig: (root: string, layout: ProjectLayout) => string | undefined =
  untypedExtendedProjectTsconfig;
const projectTsconfigFiles: (root: string, layout: ProjectLayout) => string[] =
  untypedProjectTsconfigFiles;
const typescriptNotices: (options: {
  config: Record<string, unknown>;
  projectRoot: string;
}) => unknown = untypedNotices;

const { projectWith } = useTemporaryProjects('nitpicker-ts-solution-', { resolveSymlinks: true });

const LAYOUT = { javascript: false, sourceRoots: ['src'] };
const refs = (...names: string[]) =>
  json({ files: [], references: names.map((name) => ({ path: `./${name}` })) });
const withSources = (files: Record<string, string>) => projectWith({ ...SOURCES, ...files });

describe('a solution tsconfig', () => {
  it('checks test files with the options of the config that includes them', async () => {
    const root = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': SPEC,
      ...STUBS,
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.spec.json');
    expect(await diagnostics(root)).toEqual([]);
  });

  it('would miss the test globals and JSX settings with only the build config', async () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.build.json'),
      'tsconfig.build.json': BUILD,
      ...STUBS,
    });

    const codes = (await diagnostics(root)).map(({ code }) => code);

    expect([...new Set(codes)].toSorted((a, b) => a - b)).toEqual([2304, 2593, 7026, 17004]);
  });

  it('follows a solution config that references another solution config', async () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.app.json'),
      'tsconfig.app.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': SPEC,
      ...STUBS,
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.spec.json');
    expect(await diagnostics(root)).toEqual([]);
  });

  it('stops at references that point back to a config it has seen', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.app.json'),
      'tsconfig.app.json': refs('tsconfig.json', 'tsconfig.spec.json'),
      'tsconfig.spec.json': SPEC,
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.spec.json');
  });

  it.each([
    ['an include of the project folder', json({ include: ['.'] })],
    ['a recursive include', json({ include: ['**/*.ts', '**/*.tsx'] })],
    ['a files list', json({ files: ['src/value.ts', 'src/value.test.ts', 'src/view.test.tsx'] })],
    ['an extended include', json({ extends: './tsconfig.base.json' })],
  ])('reads the files of %s from the parsed config', (_name, spec) => {
    const root = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': spec,
      'tsconfig.base.json': json({ include: ['src'] }),
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.spec.json');
  });

  it('prefers the config that covers the most files over one with only many tests', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.e2e.json', 'tsconfig.all.json'),
      'tsconfig.e2e.json': json({ include: ['test'] }),
      'tsconfig.all.json': json({ include: ['src', 'test'] }),
      'test/a.test.ts': 'export {};\n',
      'test/b.test.ts': 'export {};\n',
      'test/c.test.ts': 'export {};\n',
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.all.json');
  });

  it('breaks a tie in covered files by test files, then by reference order', () => {
    const tied = (first: string, second: string) =>
      withSources({
        'tsconfig.json': refs(first, second),
        'tsconfig.a.json': json({ files: ['src/value.ts', 'src/value.test.ts'] }),
        'tsconfig.b.json': json({ files: ['src/value.ts', 'src/value.test.ts'] }),
        'tsconfig.c.json': json({ files: ['src/value.ts', 'src/view.test.tsx'] }),
      });

    expect(extendedProjectTsconfig(tied('tsconfig.b.json', 'tsconfig.a.json'), LAYOUT)).toBe(
      './tsconfig.b.json',
    );
    expect(projectTsconfigFiles(tied('tsconfig.a.json', 'tsconfig.c.json'), LAYOUT)).toEqual([
      'tsconfig.a.json',
      'tsconfig.json',
    ]);
  });

  it('ignores a reference that covers no file of the layout', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.tools.json', 'tsconfig.build.json'),
      'tsconfig.tools.json': json({ files: ['scripts/tool.ts'] }),
      'tsconfig.build.json': json({ include: ['src'], exclude: ['src/**/*.test.*'] }),
      'scripts/tool.ts': 'export {};\n',
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.build.json');
  });

  it('counts test files with the layout when it has its own test rule', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.one.json', 'tsconfig.two.json'),
      'tsconfig.one.json': json({ files: ['src/value.ts', 'src/value.test.ts'] }),
      'tsconfig.two.json': json({ files: ['src/value.ts', 'src/view.test.tsx'] }),
    });
    const layout = { ...LAYOUT, isTestFile: (file: string) => file.endsWith('.tsx') };

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.one.json');
    expect(extendedProjectTsconfig(root, layout)).toBe('./tsconfig.two.json');
  });

  it('falls back to the solution file when no reference covers a file of the layout', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.tools.json', 'tsconfig.other.json'),
      'tsconfig.tools.json': json({ files: ['scripts/tool.ts'] }),
      'tsconfig.other.json': json({ files: ['scripts/tool.ts'] }),
      'scripts/tool.ts': 'export {};\n',
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.json');
  });

  it('keeps the options of production files that the spec config would change', async () => {
    const root = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': SPEC,
      ...STUBS,
      ...PRODUCTION_WITH_NODE,
    });

    expect(await diagnostics(root)).toEqual([]);
    expect(projectTsconfigFiles(root, LAYOUT)).toEqual([
      'tsconfig.spec.json',
      'tsconfig.json',
      'tsconfig.build.json',
    ]);
  });

  it('does not inherit the root folder or build output of the chosen config', async () => {
    const root = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': json({
        compilerOptions: {
          ...COMMON,
          rootDir: 'src',
          outDir: 'dist',
          types: ['vitest/globals'],
          jsx: 'react-jsx',
          jsxImportSource: 'hono/jsx',
        },
        include: ['src'],
      }),
      ...STUBS,
      'test/extra.test.ts': "it('runs', () => {});\n",
    });

    expect(await diagnostics(root)).toEqual([]);
  });
});

describe('a chosen config with a rootDir', () => {
  const rooted = {
    'tsconfig.json': SOLUTION,
    'tsconfig.build.json': BUILD,
    'tsconfig.spec.json': json({
      compilerOptions: {
        ...COMMON,
        rootDir: 'src',
        types: ['vitest/globals'],
        jsx: 'react-jsx',
        jsxImportSource: 'hono/jsx',
      },
      include: ['src'],
    }),
    'vitest.config.ts': 'export default {};\n',
  };

  it('leaves root config files out of the check instead of reporting them as outside', async () => {
    const root = withSources({ ...rooted, ...STUBS });

    expect(await diagnostics(root)).toEqual([]);
  });

  it('says so in the note, and stays silent when nothing is left out', () => {
    const left = withSources(rooted);
    const { 'vitest.config.ts': _config, ...without } = rooted;
    const clean = withSources(without);
    const notes = (projectRoot: string) => typescriptNotices({ config: {}, projectRoot });

    expect(notes(left)).toEqual([
      'TypeScript: solution tsconfig.json resolved to tsconfig.spec.json (it includes the test files; files outside its rootDir are not checked; types merged from tsconfig.build.json)',
    ]);
    expect(notes(clean)).toEqual([
      'TypeScript: solution tsconfig.json resolved to tsconfig.spec.json (it includes the test files; types merged from tsconfig.build.json)',
    ]);
  });
});

describe('a tsconfig that is not a solution file', () => {
  it('is extended as it is', async () => {
    const root = withSources({
      'tsconfig.json': json({
        compilerOptions: {
          ...COMMON,
          types: ['vitest/globals'],
          jsx: 'react-jsx',
          jsxImportSource: 'hono/jsx',
        },
        include: ['src'],
        references: [{ path: './tsconfig.other.json' }],
      }),
      'tsconfig.other.json': BUILD,
      ...STUBS,
    });

    expect(extendedProjectTsconfig(root, LAYOUT)).toBe('./tsconfig.json');
    expect(await diagnostics(root)).toEqual([]);
  });
});

describe('the note about a resolved solution tsconfig', () => {
  const notes = (root: string, config: Record<string, unknown> = {}) =>
    typescriptNotices({ config, projectRoot: root });

  it('names the config that was used, why, and where types were merged from', () => {
    const root = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': SPEC,
    });

    expect(notes(root)).toEqual([
      'TypeScript: solution tsconfig.json resolved to tsconfig.spec.json (it includes the test files; types merged from tsconfig.build.json)',
    ]);
  });

  it('says source files when no referenced config includes a test file', () => {
    const root = withSources({
      'tsconfig.json': refs('tsconfig.build.json', 'tsconfig.other.json'),
      'tsconfig.build.json': json({ include: ['src'], exclude: ['src/**/*.test.*'] }),
      'tsconfig.other.json': json({ files: ['src/value.ts'] }),
    });

    expect(notes(root)).toEqual([
      'TypeScript: solution tsconfig.json resolved to tsconfig.build.json (it includes the source files)',
    ]);
  });

  it('is silent for a plain tsconfig, an unresolved solution and a selected project config', () => {
    const plain = withSources({ 'tsconfig.json': BUILD });
    const unresolved = withSources({
      'tsconfig.json': refs('tsconfig.tools.json', 'tsconfig.more.json'),
      'tsconfig.tools.json': json({ files: ['scripts/tool.ts'] }),
      'tsconfig.more.json': json({ files: ['scripts/tool.ts'] }),
      'scripts/tool.ts': 'export {};\n',
    });
    const solution = withSources({
      'tsconfig.json': SOLUTION,
      'tsconfig.build.json': BUILD,
      'tsconfig.spec.json': SPEC,
    });

    expect(notes(plain)).toEqual([]);
    expect(notes(unresolved)).toEqual([]);
    expect(notes(solution, { tools: { typescript: { project: 'tsconfig.json' } } })).toEqual([]);
  });
});

describe('a solution jsconfig in the JavaScript preset', () => {
  it('resolves to the referenced config that includes the tests', () => {
    const allowJs = { allowJs: true };
    const root = projectWith({
      'jsconfig.json': refs('jsconfig.build.json', 'jsconfig.spec.json'),
      'jsconfig.build.json': json({
        compilerOptions: allowJs,
        include: ['src'],
        exclude: ['src/**/*.test.js'],
      }),
      'jsconfig.spec.json': json({ compilerOptions: allowJs, include: ['src'] }),
      'src/value.js': 'export const value = 1;\n',
      'src/value.test.js': "import { value } from './value.js';\nexport const copy = value;\n",
    });

    expect(extendedProjectTsconfig(root, { javascript: true, sourceRoots: ['src'] })).toBe(
      './jsconfig.spec.json',
    );
  });
});
