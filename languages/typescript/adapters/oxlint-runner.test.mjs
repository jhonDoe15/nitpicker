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
    rules: { 'no-debugger': 'error', 'local/no-foo': 'error' },
  },
  { files: ['src/strict/**/*.ts'], linterOptions: { noInlineConfig: true } },
];
`;

const SOURCES = {
  'src/plain.ts': "// eslint-disable-next-line no-debugger\ndebugger;\nconst é = 'ü'; debugger;\n",
  'src/strict/locked.ts': '/* eslint-disable */\ndebugger;\nexport const foo = 1;\n',
  'src/[id].ts': 'debugger;\n',
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

  it('lints files whose names contain glob characters', () => {
    expect(messagesOf('src/[id].ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 1 }]);
  });
});
