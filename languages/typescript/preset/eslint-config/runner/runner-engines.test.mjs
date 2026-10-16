import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';

function policyFor(runner) {
  return `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(import.meta.resolve('../../eslint-plugin/index.mjs'))};
import { testRunnerLintConfig } from ${JSON.stringify(import.meta.resolve('./runner-rules.mjs'))};

const config = await testRunnerLintConfig(${JSON.stringify(runner)});

export default [
  { languageOptions: { parser: tseslint.parser } },
  {
    files: ['**/*.test.mjs'],
    plugins: { ...config.plugins, nitpicker: nitpickerRules },
    settings: config.settings,
    languageOptions: { globals: config.globals },
    rules: {
      ...config.rules,
      'nitpicker/no-fixed-sleep-synchronization': ['error', { runner: ${JSON.stringify(runner)} }],
      'nitpicker/no-interval-polling-in-tests': ['error', { runner: ${JSON.stringify(runner)} }],
    },
  },
];
`;
}

const NODE_HEAD = "import test from 'node:test';\nimport assert from 'node:assert';\n";

const SOURCES = {
  vitest: [
    "import { it, expect, vi } from 'vitest';",
    "it('a', () => {});",
    "it.only('b', () => { expect(1).toBe(1); });",
    "it('b', () => { expect(1).toBe(1); });",
    "it('c', async () => { await new Promise((resolve) => setTimeout(resolve, 100)); expect(1).toBe(1); });",
    "it('d', () => { setInterval(() => {}, 5); expect(vi).toBeDefined(); });",
  ],
  jest: [
    "it('a', () => {});",
    "it.only('b', () => { expect(1).toBe(1); });",
    "it('b', () => { expect(1).toBe(1); });",
    "it('c', async () => { await new Promise((resolve) => setTimeout(resolve, 100)); expect(1).toBe(1); });",
    "it('d', () => { setInterval(() => {}, 5); expect(1).toBe(1); });",
  ],
  node: [
    NODE_HEAD,
    "test('a', () => {});",
    "test.only('b', () => { assert.ok(1); });",
    "test('b', () => { assert.ok(1); });",
    "test('c', async () => { await new Promise((resolve) => setTimeout(resolve, 100)); assert.ok(1); });",
    "test('d', () => { setInterval(() => {}, 5); assert.ok(1); });",
  ],
  mocha: [
    "it('a', () => {});",
    "it.only('b', () => { assert.ok(1); });",
    "it('b', () => { assert.ok(1); });",
    "it('c', async () => { await new Promise((resolve) => setTimeout(resolve, 100)); assert.ok(1); });",
    "it('d', () => { setInterval(() => {}, 5); assert.ok(1); });",
  ],
};

const NODE_NAMED = [
  "import { describe, it } from 'node:test';",
  "import assert from 'node:assert';",
  "describe('suite', () => {",
  "  it('a', () => {});",
  "  it('b', () => { assert.ok(1); });",
  "  it('b', () => { assert.ok(1); });",
  '});',
];

function located(messages) {
  return messages.map(
    ({ ruleId, line, column, message }) => `${ruleId}@${String(line)}:${String(column)} ${message}`,
  );
}

function writeProject(root, runner, lines) {
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'policy.mjs'), policyFor(runner));
  writeFileSync(path.join(root, 'src/sample.test.mjs'), `${lines.join('\n')}\n`);
}

async function bothEngines(runner, lines) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-engines-')));
  try {
    writeProject(root, runner, lines);
    const oxlint = lintWithOxlint({
      options: { projectRoot: root, patterns: ['src/**/*.test.mjs'] },
      environment: {
        ...process.env,
        NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
      },
      runEslintCli: () => {
        throw new Error('no rule needs ESLint here');
      },
    });
    const eslint = await new ESLint({
      cwd: root,
      overrideConfigFile: path.join(root, 'policy.mjs'),
    }).lintFiles(['src/**/*.test.mjs']);
    const file = path.join(root, 'src/sample.test.mjs');
    const messagesOf = (results) => results.find((entry) => entry.filePath === file)?.messages;
    return { eslint: located(messagesOf(eslint) ?? []), oxlint: located(messagesOf(oxlint) ?? []) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the test file rules report the same on both lint engines', () => {
  it.each(Object.keys(SOURCES))('for a %s project', async (runner) => {
    const { eslint, oxlint } = await bothEngines(runner, SOURCES[runner]);

    expect(eslint.length).toBeGreaterThanOrEqual(4);
    expect(oxlint).toEqual(eslint);
  });

  it('for node:test named imports and a describe block', async () => {
    const { eslint, oxlint } = await bothEngines('node', NODE_NAMED);

    expect(eslint.map((entry) => entry.split(' ')[0])).toEqual([
      'node-test/expect-expect@4:3',
      'node-test/no-identical-title@6:6',
    ]);
    expect(oxlint).toEqual(eslint);
  });

  it('with messages that name the runner of the project', async () => {
    const jest = await bothEngines('jest', SOURCES.jest);
    const node = await bothEngines('node', SOURCES.node);

    expect(jest.oxlint.join('\n')).toContain('Testing Library or jest.advanceTimersByTimeAsync');
    expect(node.oxlint.join('\n')).toContain('mock.timers.tick');
    expect(jest.oxlint.join('\n') + node.oxlint.join('\n')).not.toContain('vi.');
  });
});
