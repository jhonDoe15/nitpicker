import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { eslintShapedResults } from '../../oxlint-diagnostics.mjs';
import { lintWithOxlint } from '../../oxlint-runner.mjs';
import { lintTypeScriptConfig } from './lint-tsconfig.mjs';
import { typeScript7Options } from './typescript7-options.mjs';

const TYPED_POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-unnecessary-type-assertion': 'error' },
  },
];
`;

const PINNED = { types: [], lib: ['ES2022'] };
const ES5_DEFAULT_LIBRARIES = ['es5', 'dom', 'webworker.importscripts', 'scripthost'];
const RESOLVED = [{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 2 }];
const roots = [];

afterAll(() => {
  for (const projectRoot of roots) rmSync(projectRoot, { recursive: true, force: true });
});

function project(projectFiles, specifier) {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-lint-tsconfig-')));
  roots.push(projectRoot);
  const files = {
    'policy.mjs': TYPED_POLICY,
    'src/lib/value.ts': "export const sure: string = 'x';\n",
    'src/use.ts': `import { sure } from '${specifier}';\nexport const redundant = sure as string;\n`,
    ...projectFiles,
  };
  for (const [relativePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
    writeFileSync(path.join(projectRoot, relativePath), text);
  }
  return projectRoot;
}

function lintUse(projectFiles, specifier = '@/lib/value') {
  const projectRoot = project(projectFiles, specifier);
  const projectConfigPath = path.join(projectRoot, 'tsconfig.nitpicker.json');
  const lintResults = lintWithOxlint({
    options: { projectRoot, patterns: ['src/**/*.ts'] },
    projectConfigPath,
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(projectRoot, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath,
    },
    runEslintCli: () => {
      throw new Error('no rule needs ESLint here');
    },
  });
  return lintResults
    .find((entry) => entry.filePath === path.join(projectRoot, 'src/use.ts'))
    ?.messages.map(({ ruleId, line }) => ({ ruleId, line }));
}

function layered(extended) {
  return JSON.stringify({
    extends: extended,
    compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
    include: ['src/**/*.ts'],
  });
}

function projectOptions(compilerOptions) {
  return {
    'tsconfig.json': JSON.stringify({ compilerOptions: { ...PINNED, ...compilerOptions } }),
    'tsconfig.nitpicker.json': layered('./tsconfig.json'),
  };
}

function staged(projectFiles) {
  const projectRoot = project(projectFiles, './lib/value');
  return JSON.parse(lintTypeScriptConfig(path.join(projectRoot, 'tsconfig.nitpicker.json')));
}

describe('lintWithOxlint with the project tsconfig paths', () => {
  it.each([
    ['baseUrl with non-relative paths', { baseUrl: '.', paths: { '@/*': ['src/*'] } }],
    ['non-relative paths without baseUrl', { paths: { '@/*': ['src/*'] } }],
    ['relative paths', { paths: { '@/*': ['./src/*'] } }],
    ['a nested baseUrl', { baseUrl: './src', paths: { '@/*': ['*'] } }],
  ])('resolves an alias the project declares with %s', (_form, compilerOptions) => {
    expect(lintUse(projectOptions(compilerOptions))).toEqual(RESOLVED);
  });

  it('resolves a bare import through baseUrl alone', () => {
    expect(lintUse(projectOptions({ baseUrl: './src' }), 'lib/value')).toEqual(RESOLVED);
  });

  it('resolves paths from a referenced app config that extends a package config', () => {
    const projectFiles = {
      'node_modules/@fixture/base/tsconfig.json': JSON.stringify({
        compilerOptions: {
          ...PINNED,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      }),
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }),
      'tsconfig.app.json': JSON.stringify({
        extends: '@fixture/base/tsconfig.json',
        compilerOptions: { ...PINNED, baseUrl: '.', paths: { '@/*': ['src/*'] } },
        include: ['src'],
      }),
      'tsconfig.nitpicker.json': layered('./tsconfig.app.json'),
    };

    expect(lintUse(projectFiles)).toEqual(RESOLVED);
  });
});

describe('lintWithOxlint with options TypeScript 7 removed', () => {
  it.each([
    ['outFile', { outFile: './out.js' }],
    ['out', { out: './out.js' }],
    ['downlevelIteration', { downlevelIteration: true }],
    ['importsNotUsedAsValues', { importsNotUsedAsValues: 'remove' }],
    ['preserveValueImports', { preserveValueImports: true }],
    ['keyofStringsOnly', { keyofStringsOnly: true }],
    ['noImplicitUseStrict', { noImplicitUseStrict: true }],
    ['suppressExcessPropertyErrors', { suppressExcessPropertyErrors: true }],
    ['suppressImplicitAnyIndexErrors', { suppressImplicitAnyIndexErrors: true }],
    ['noStrictGenericChecks', { noStrictGenericChecks: true }],
    ['charset', { charset: 'utf8' }],
    ['alwaysStrict false', { alwaysStrict: false }],
    ['allowSyntheticDefaultImports false', { allowSyntheticDefaultImports: false }],
    ['esModuleInterop false', { esModuleInterop: false }],
    ['target ES3', { target: 'ES3' }],
    ['target ES5', { target: 'ES5' }],
    ['module AMD', { module: 'AMD' }],
    ['module UMD', { module: 'UMD' }],
    ['module System', { module: 'System' }],
    ['module None', { module: 'None' }],
    ['moduleResolution node', { moduleResolution: 'node' }],
    ['moduleResolution node10', { moduleResolution: 'node10' }],
    ['moduleResolution classic', { moduleResolution: 'classic' }],
    [
      'moduleResolution node10 under module NodeNext',
      { module: 'NodeNext', moduleResolution: 'node10' },
    ],
    ['a types entry without type definitions', { types: ['absent-types'] }],
  ])('runs type-aware rules for a project with %s', (_option, compilerOptions) => {
    expect(lintUse(projectOptions(compilerOptions), './lib/value')).toEqual(RESOLVED);
  });

  it('runs type-aware rules for an ES5 target on the ES5 default libraries', () => {
    const projectFiles = {
      'tsconfig.nitpicker.json': JSON.stringify({
        compilerOptions: { strict: true, types: [], lib: ES5_DEFAULT_LIBRARIES, target: 'ES5' },
        include: ['src/**/*.ts'],
      }),
    };

    expect(lintUse(projectFiles, './lib/value')).toEqual(RESOLVED);
  });
});

describe('the staged lint tsconfig', () => {
  it('flattens the extended configs, with their paths relative to the stage root', () => {
    const config = staged({
      'node_modules/@fixture/base/tsconfig.json': JSON.stringify({
        compilerOptions: {
          ...PINNED,
          typeRoots: ['./types'],
          outFile: './out.js',
          moduleResolution: 'node10',
        },
      }),
      'tsconfig.json': JSON.stringify({
        extends: '@fixture/base/tsconfig.json',
        compilerOptions: { ...PINNED, module: 'NodeNext', rootDir: '${configDir}/src' },
        references: [{ path: './tsconfig.app.json' }],
      }),
      'tsconfig.nitpicker.json': layered('./tsconfig.json'),
    });

    expect(config).toEqual({
      compilerOptions: {
        typeRoots: ['./node_modules/@fixture/base/types'],
        moduleResolution: 'nodenext',
        module: 'NodeNext',
        rootDir: './src',
        strict: true,
        skipLibCheck: true,
        types: [],
        lib: ['ES2022'],
        noEmit: true,
      },
      files: ['./src/use.ts', './src/lib/value.ts'],
    });
  });

  it('keeps the ES5 default libraries and module when it raises an ES5 target', () => {
    const context = { directory: tmpdir(), resolvedOptions: {} };

    expect(typeScript7Options({ target: 'ES5' }, context)).toEqual({
      target: 'es2015',
      module: 'commonjs',
      lib: ES5_DEFAULT_LIBRARIES,
    });
    expect(typeScript7Options({ target: 'ES5', noLib: true }, context)).toEqual({
      target: 'es2015',
      module: 'commonjs',
      noLib: true,
    });
  });
});

describe('type-aware rules that cannot run', () => {
  it('names the tsconfig error TypeScript 7 rejects', () => {
    expect(() => lintUse(projectOptions({ declarationMap: true }), './lib/value')).toThrow(
      "Type-aware rules cannot run: TypeScript 7 rejects the lint tsconfig: Option 'declarationMap' " +
        "cannot be specified without specifying option 'declaration' or option 'composite'.",
    );
  });

  it('names a removed option the staged config has no replacement for', () => {
    const configError = (help) => ({
      message: 'Invalid tsconfig',
      code: 'typescript(tsconfig-error)',
      filename: 'tsconfig.json',
      help,
      labels: [],
    });
    const diagnostics = [
      configError(
        "Option 'futureOption' has been removed. Please remove it from your configuration.\nSee the tsgolint issue.",
      ),
      configError("Cannot find type definition file for 'absent-types'."),
    ];

    expect(() => eslintShapedResults(tmpdir(), diagnostics, {})).toThrow(
      "Type-aware rules cannot run: TypeScript 7 removed tsconfig option 'futureOption'; " +
        "remove it from the project tsconfig. no type definitions found for 'absent-types' in the tsconfig types.",
    );
  });
});
