import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from './oxlint-runner.mjs';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

const local = {
  rules: {
    'no-foo': {
      meta: { type: 'problem', schema: [], messages: { foo: 'No foo.' } },
      create(context) {
        return {
          Identifier(node) {
            if (node.name === 'foo') context.report({ node, messageId: 'foo' });
          },
        };
      },
    },
  },
};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { local },
    rules: {
      'no-debugger': 'error',
      'no-irregular-whitespace': 'error',
      'local/no-foo': 'error',
    },
  },
  { files: ['src/strict/**/*.ts'], linterOptions: { noInlineConfig: true } },
];
`;

const SOURCES = {
  'src/plain.ts': "// eslint-disable-next-line no-debugger\ndebugger;\nconst é = 'ü'; debugger;\n",
  'src/strict/locked.ts': '/* eslint-disable */\ndebugger;\nexport const foo = 1;\n',
  'src/[id].ts': 'debugger;\n',
  'src/bridged.ts':
    '// eslint-disable-next-line local/no-foo\nexport const foo = 1;\nexport const bar = foo;\n',
  'src/separators.ts': "export const s = 'a\u2028b';\r\ndebugger;\rdebugger;\n",
  'src/bom.ts': '\uFEFFconst x = 1; debugger;\nexport { x };\n',
};

let root;
let results;

function messagesOf(relativePath) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line, column }) => ({ ruleId, line, column }));
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-test-')));
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [relativePath, text] of Object.entries(SOURCES)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), text);
  }
  results = lintWithOxlint({
    options: { projectRoot: root, patterns: ['src/**/*.ts'] },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => {
      throw new Error('no rule needs ESLint here');
    },
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lintWithOxlint', () => {
  it('honors disable comments and reports columns in UTF-16 units like ESLint', () => {
    expect(messagesOf('src/plain.ts')).toEqual([{ ruleId: 'no-debugger', line: 3, column: 16 }]);
  });

  it('ignores disable comments where the config locks inline configuration, and says so', () => {
    expect(messagesOf('src/strict/locked.ts')).toEqual([
      { ruleId: undefined, line: 1, column: 1 },
      { ruleId: 'no-debugger', line: 2, column: 1 },
      { ruleId: 'local/no-foo', line: 3, column: 14 },
    ]);
  });

  it('reports the message id the ESLint rule used', () => {
    const locked = results.find(
      (entry) => entry.filePath === path.join(root, 'src/strict/locked.ts'),
    );
    expect(locked.messages.find((message) => message.ruleId === 'local/no-foo').messageId).toBe(
      'foo',
    );
  });

  it('applies disable comments to rules loaded from ESLint plugins', () => {
    expect(messagesOf('src/bridged.ts')).toEqual([{ ruleId: 'local/no-foo', line: 3, column: 20 }]);
  });

  it('counts lines and columns the way ESLint does', () => {
    expect(messagesOf('src/separators.ts')).toEqual([
      { ruleId: 'no-debugger', line: 3, column: 1 },
      { ruleId: 'no-debugger', line: 4, column: 1 },
    ]);
    expect(messagesOf('src/bom.ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 14 }]);
  });

  it('lints files whose names contain glob characters', () => {
    expect(messagesOf('src/[id].ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 1 }]);
  });
});

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

const TYPED_SOURCE =
  'declare const maybe: string | null;\nexport const needed = maybe as string;\ndeclare const sure: string;\nexport const redundant = sure as string;\n';

describe('lintWithOxlint with type-aware rules', () => {
  let typedRoot;
  let typedResults;

  beforeAll(() => {
    typedRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-typed-test-')));
    const files = {
      'policy.mjs': TYPED_POLICY,
      'tsconfig.nitpicker.json': JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
        include: ['src/**/*.ts'],
      }),
      'src/sub/tsconfig.json': JSON.stringify({
        compilerOptions: { strict: false, types: [], lib: ['ES2022'] },
      }),
      'src/top.ts': TYPED_SOURCE,
      'src/sub/nested.ts': TYPED_SOURCE,
    };
    for (const [relativePath, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(typedRoot, relativePath)), { recursive: true });
      writeFileSync(path.join(typedRoot, relativePath), text);
    }
    const projectConfigPath = path.join(typedRoot, 'tsconfig.nitpicker.json');
    typedResults = lintWithOxlint({
      options: { projectRoot: typedRoot, patterns: ['src/**/*.ts'] },
      projectConfigPath,
      environment: {
        ...process.env,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(typedRoot, 'policy.mjs'),
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: typedRoot,
        NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: projectConfigPath,
      },
      runEslintCli: () => {
        throw new Error('no rule needs ESLint here');
      },
    });
  });

  afterAll(() => {
    rmSync(typedRoot, { recursive: true, force: true });
  });

  it('checks every file against the lint config, not a nested tsconfig.json', () => {
    const lines = (relativePath) =>
      typedResults
        .find((entry) => entry.filePath === path.join(typedRoot, relativePath))
        ?.messages.map(({ ruleId, line }) => ({ ruleId, line }));
    const expected = [{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 4 }];

    expect(lines('src/top.ts')).toEqual(expected);
    expect(lines('src/sub/nested.ts')).toEqual(expected);
  });
});
