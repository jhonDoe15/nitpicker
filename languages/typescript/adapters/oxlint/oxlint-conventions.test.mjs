import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProject, lintProject } from './test-support/oxlint-project.mjs';

const PLUGIN_URL = import.meta.resolve('../../preset/eslint-plugin/index.mjs');

function policy({ fixStyle, casing }) {
  return `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(PLUGIN_URL)};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin, nitpicker: nitpickerRules },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false, fixStyle: ${JSON.stringify(fixStyle)} },
      ],
      'nitpicker/file-name-casing': ['error', { casing: ${JSON.stringify(casing)} }],
    },
  },
];
`;
}

const SOURCES = {
  'src/types.ts': 'export type Name = string;\n',
  'src/separate-style.ts': "import type { Name } from './types';\nexport const a: Name = 'a';\n",
  'src/inline-style.ts': "import { type Name } from './types';\nexport const b: Name = 'b';\n",
  'src/snake/one_a.ts': 'export const one = 1;\n',
  'src/snake/two_b.ts': 'export const two = 2;\n',
  'src/snake/three_c.ts': 'export const three = 3;\n',
  'src/snake/odd-one.ts': 'export const odd = 4;\n',
  'src/valueStyle.ts': "import { Name } from './types';\nexport const c: Name = 'c';\n",
};

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function findings(options) {
  const root = createProject('nitpicker-oxlint-conventions-', {
    'policy.mjs': policy(options),
    ...SOURCES,
  });
  roots.push(root);
  return (await lintProject({ root, patterns: ['src/**/*.ts'] })).flatMap((result) =>
    result.messages.map(({ ruleId, line }) => ({
      file: path.relative(root, result.filePath),
      ruleId,
      line,
    })),
  );
}

describe('convention-driven rules on the default oxlint engine', () => {
  it.each(['separate-type-imports', 'inline-type-imports'])(
    'accepts both type import forms with fixStyle %s and flags only the value import',
    async (fixStyle) => {
      expect(await findings({ fixStyle, casing: 'kebab-case' })).toEqual([
        { file: 'src/snake/odd-one.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
        {
          file: 'src/valueStyle.ts',
          ruleId: '@typescript-eslint/consistent-type-imports',
          line: 1,
        },
        { file: 'src/valueStyle.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      ]);
    },
  );

  it('checks file names against the configured casing and the folder majority', async () => {
    expect(await findings({ fixStyle: 'separate-type-imports', casing: 'camelCase' })).toEqual([
      { file: 'src/inline-style.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      { file: 'src/separate-style.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      { file: 'src/snake/odd-one.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      { file: 'src/valueStyle.ts', ruleId: '@typescript-eslint/consistent-type-imports', line: 1 },
    ]);
  });
});

function decoratorPolicy() {
  return `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
];
`;
}

async function decoratorRun(compilerOptions) {
  const root = createProject('nitpicker-oxlint-decorators-', {
    'policy.mjs': decoratorPolicy(),
    'tsconfig.json': JSON.stringify({ compilerOptions, include: ['src'] }),
    'src/store.ts': 'export type Store = { size: number };\n',
    'src/cats.ts':
      "import { Store } from './store';\nexport const size = (store: Store) => store.size;\n",
  });
  roots.push(root);
  const residualRuns = [];
  const results = await lintProject({
    root,
    patterns: ['src/**/*.ts'],
    runEslintCli: (files, environment) => {
      residualRuns.push({ files, rules: JSON.parse(environment.NITPICKER_DIFF_ESLINT_ONLY_RULES) });
      return [];
    },
  });
  const ruleIds = results.flatMap((result) => result.messages.map(({ ruleId }) => ruleId));
  return { ruleIds, residualRuns };
}

describe('type imports where the compiler emits decorator metadata', () => {
  it('runs the type import rule through ESLint, which knows the decorator metadata', async () => {
    const run = await decoratorRun({ experimentalDecorators: true, emitDecoratorMetadata: true });

    expect(run).toEqual({
      ruleIds: [],
      residualRuns: [
        {
          files: ['src/cats.ts', 'src/store.ts'],
          rules: ['@typescript-eslint/consistent-type-imports'],
        },
      ],
    });
  });

  it.each([{}, { experimentalDecorators: true }, { emitDecoratorMetadata: true }])(
    'keeps the rule on oxlint with compiler options %j',
    async (compilerOptions) => {
      expect(await decoratorRun(compilerOptions)).toEqual({
        ruleIds: ['@typescript-eslint/consistent-type-imports'],
        residualRuns: [],
      });
    },
  );
});
