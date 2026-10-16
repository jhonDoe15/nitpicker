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
  'src/valueStyle.ts': "import { Name } from './types';\nexport const c: Name = 'c';\n",
};

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function findings(options) {
  const root = createProject('nitpicker-oxlint-conventions-', {
    'policy.mjs': policy(options),
    ...SOURCES,
  });
  roots.push(root);
  return lintProject({ root, patterns: ['src/**/*.ts'] }).flatMap((result) =>
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
    (fixStyle) => {
      expect(findings({ fixStyle, casing: 'kebab-case' })).toEqual([
        {
          file: 'src/valueStyle.ts',
          ruleId: '@typescript-eslint/consistent-type-imports',
          line: 1,
        },
        { file: 'src/valueStyle.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      ]);
    },
  );

  it('checks file names against the configured casing', () => {
    expect(findings({ fixStyle: 'separate-type-imports', casing: 'camelCase' })).toEqual([
      { file: 'src/inline-style.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      { file: 'src/separate-style.ts', ruleId: 'nitpicker/file-name-casing', line: 1 },
      { file: 'src/valueStyle.ts', ruleId: '@typescript-eslint/consistent-type-imports', line: 1 },
    ]);
  });
});
