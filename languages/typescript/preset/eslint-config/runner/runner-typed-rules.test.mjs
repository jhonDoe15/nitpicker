import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';

const TYPES_ROOT = path.join(import.meta.dirname, '../../../../../node_modules/@types');

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { testRunnerLintConfig } from ${JSON.stringify(import.meta.resolve('./runner-rules.mjs'))};

function blockFor(runner) {
  return {
    files: ['src/' + runner + '/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      ...testRunnerLintConfig(runner).typedRules,
    },
  };
}

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
  ...['node', 'mocha'].map(blockFor),
];
`;

const FILES = {
  'node/suite.test.ts': [
    "import { after, before, describe, it, suite, test } from 'node:test';",
    "import assert from 'node:assert';",
    'before(() => {});',
    'after(() => {});',
    "describe('a', () => { it('b', () => { assert.ok(1); }); });",
    "describe.skip('c', () => {});",
    "suite('d', () => {});",
    "test('e', () => { assert.ok(1); });",
    "it.only('f', () => { assert.ok(1); });",
    "test.todo('g');",
    'async function work(): Promise<void> {}',
    'work();',
  ],
  'mocha/suite.test.ts': [
    "import { before, describe, it } from 'mocha';",
    "import assert from 'node:assert';",
    'before(() => {});',
    "describe('a', () => { it('b', () => { assert.ok(1); }); });",
    "describe.skip('c', () => {});",
    'async function work(): Promise<void> {}',
    'work();',
  ],
};

let root;
let eslintFindings;
let oxlintFindings;

function located(results) {
  return Object.fromEntries(
    results.map(({ filePath, messages }) => [
      path.relative(path.join(root, 'src'), filePath),
      messages.map(({ ruleId, line, column }) => `${ruleId}@${String(line)}:${String(column)}`),
    ]),
  );
}

function writeProject() {
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        module: 'nodenext',
        lib: ['ES2022'],
        types: ['node', 'mocha'],
        typeRoots: [TYPES_ROOT],
      },
      include: ['src/**/*.ts'],
    }),
  );
  for (const [name, lines] of Object.entries(FILES)) {
    const file = path.join(root, 'src', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${lines.join('\n')}\n`);
  }
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-typed-')));
  writeProject();
});

beforeAll(async () => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  eslintFindings = located(await eslint.lintFiles(['src/**/*.ts']));
});

beforeAll(() => {
  oxlintFindings = located(
    lintWithOxlint({
      options: { projectRoot: root, patterns: ['src/**/*.ts'] },
      projectConfigPath: path.join(root, 'tsconfig.json'),
      environment: {
        ...process.env,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
        NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: path.join(root, 'tsconfig.json'),
      },
      runEslintCli: () => {
        throw new Error('no rule needs ESLint here');
      },
    }),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the typed test file rules follow the runner', () => {
  it('leave the suites and tests node:test returns promises for, and every other promise, to no-floating-promises', () => {
    const expected = {
      'node/suite.test.ts': ['@typescript-eslint/no-floating-promises@12:1'],
      'mocha/suite.test.ts': ['@typescript-eslint/no-floating-promises@7:1'],
    };

    expect(eslintFindings).toEqual(expected);
    expect(oxlintFindings).toEqual(expected);
  });
});
