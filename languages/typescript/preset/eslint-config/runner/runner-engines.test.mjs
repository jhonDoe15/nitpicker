import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';

const RUNNERS = ['vitest', 'jest', 'node', 'mocha'];

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(import.meta.resolve('../../eslint-plugin/index.mjs'))};
import { testRunnerLintConfig } from ${JSON.stringify(import.meta.resolve('./runner-rules.mjs'))};

function blockFor(runner) {
  const config = testRunnerLintConfig(runner);
  return {
    files: ['src/' + runner + '/**/*.test.mjs'],
    plugins: { ...config.plugins, nitpicker: nitpickerRules },
    settings: config.settings,
    languageOptions: { globals: config.globals },
    rules: {
      ...config.rules,
      'nitpicker/no-fixed-sleep-synchronization': ['error', { runner }],
      'nitpicker/no-interval-polling-in-tests': ['error', { runner }],
    },
  };
}

export default [
  { languageOptions: { parser: tseslint.parser } },
  ...${JSON.stringify(RUNNERS)}.map(blockFor),
];
`;

const NODE_HEAD = ["import test from 'node:test';", "import assert from 'node:assert';"];

const SLEEP = 'await new Promise((resolve) => setTimeout(resolve, 100));';

const FILES = {
  'vitest/sample.test.mjs': [
    "import { it, expect, vi } from 'vitest';",
    "it('a', () => {});",
    "it.only('b', () => { expect(1).toBe(1); });",
    "it('b', () => { expect(1).toBe(1); });",
    `it('c', async () => { ${SLEEP} expect(1).toBe(1); });`,
    "it('d', () => { setInterval(() => {}, 5); expect(vi).toBeDefined(); });",
  ],
  'jest/sample.test.mjs': [
    "it('a', () => {});",
    "it.only('b', () => { expect(1).toBe(1); });",
    "it('b', () => { expect(1).toBe(1); });",
    `it('c', async () => { ${SLEEP} expect(1).toBe(1); });`,
    "it('d', () => { setInterval(() => {}, 5); expect(1).toBe(1); });",
  ],
  'node/sample.test.mjs': [
    ...NODE_HEAD,
    "test('a', () => {});",
    "test.only('b', () => { assert.ok(1); });",
    "test('b', () => { assert.ok(1); });",
    `test('c', async () => { ${SLEEP} assert.ok(1); });`,
    "test('d', () => { setInterval(() => {}, 5); assert.ok(1); });",
  ],
  'node/named.test.mjs': [
    "import { describe, it } from 'node:test';",
    "import assert from 'node:assert';",
    "describe('suite', () => {",
    "  it('a', () => {});",
    "  it('b', () => { assert.ok(1); });",
    "  it('b', () => { assert.ok(1); });",
    '});',
  ],
  'mocha/sample.test.mjs': [
    "it('a', () => {});",
    "it.only('b', () => { assert.ok(1); });",
    "it('b', () => { assert.ok(1); });",
    `it('c', async () => { ${SLEEP} assert.ok(1); });`,
    "it('d', () => { setInterval(() => {}, 5); assert.ok(1); });",
  ],
  'mocha/wrong-runner.test.mjs': [
    "import { vi } from 'vitest';",
    "import { mock } from 'node:test';",
    "it('a', () => { assert.ok(vi, mock); });",
  ],
};

let root = '';
let eslintFindings = {};
let oxlintFindings = {};

function located(results) {
  const byFile = {};
  for (const { filePath, messages } of results) {
    const relative = path.relative(path.join(root, 'src'), filePath);
    byFile[relative] = messages.map(
      ({ ruleId, line, column, message }) =>
        `${ruleId}@${String(line)}:${String(column)} ${message}`,
    );
  }
  return byFile;
}

function writeProject() {
  writeFileSync(path.join(root, 'policy.mjs'), POLICY);
  for (const [name, lines] of Object.entries(FILES)) {
    const file = path.join(root, 'src', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${lines.join('\n')}\n`);
  }
}

function runOxlint() {
  return lintWithOxlint({
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
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-engines-')));
  writeProject();
});

beforeAll(async () => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  eslintFindings = located(await eslint.lintFiles(['src/**/*.test.mjs']));
});

beforeAll(() => {
  oxlintFindings = located(runOxlint());
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function rulesOf(findings, name) {
  return (findings[name] ?? []).map((entry) => entry.split(' ')[0]);
}

function sleepsOf(findings, name) {
  return (findings[name] ?? [])
    .filter((entry) => entry.startsWith('nitpicker/no-fixed-sleep-synchronization@'))
    .map((entry) => entry.slice(entry.indexOf(' ') + 1));
}

describe('the test file rules report the same on both lint engines', () => {
  it.each(Object.keys(FILES))('for %s', (name) => {
    expect(eslintFindings[name]?.length).toBeGreaterThanOrEqual(2);
    expect(oxlintFindings[name]).toEqual(eslintFindings[name]);
  });

  it.each([
    ['jest/sample.test.mjs', 'waitFor from Testing Library or jest.advanceTimersByTimeAsync'],
    ['node/sample.test.mjs', 'an awaited event or promise, or mock.timers.tick'],
  ])('with a message in %s that names the call of the runner: %s', (name, advice) => {
    const message = `Fixed sleeps are non-deterministic; wait on a condition with ${advice}. If a real wait is unavoidable, add an exception for nitpicker/no-fixed-sleep-synchronization in nitpicker.config.json.`;

    expect(sleepsOf(oxlintFindings, name)).toEqual([message]);
    expect(sleepsOf(eslintFindings, name)).toEqual([message]);
  });

  it('with the rules of each runner located where the test goes wrong', () => {
    const located = Object.fromEntries(
      Object.keys(FILES).map((name) => [name, rulesOf(eslintFindings, name)]),
    );

    expect(located).toEqual({
      'vitest/sample.test.mjs': [
        'vitest/expect-expect@2:1',
        'vitest/no-focused-tests@3:4',
        'vitest/no-identical-title@4:1',
        'nitpicker/no-fixed-sleep-synchronization@5:23',
        'nitpicker/no-interval-polling-in-tests@6:17',
      ],
      'jest/sample.test.mjs': [
        'jest/expect-expect@1:1',
        'jest/no-focused-tests@2:4',
        'jest/no-identical-title@3:4',
        'nitpicker/no-fixed-sleep-synchronization@4:23',
        'nitpicker/no-interval-polling-in-tests@5:17',
      ],
      'node/sample.test.mjs': [
        'node-test/expect-expect@3:1',
        'node-test/no-focused-tests@4:6',
        'node-test/no-identical-title@5:6',
        'nitpicker/no-fixed-sleep-synchronization@6:25',
        'nitpicker/no-interval-polling-in-tests@7:19',
      ],
      'node/named.test.mjs': ['node-test/expect-expect@4:3', 'node-test/no-identical-title@6:6'],
      'mocha/sample.test.mjs': [
        'mocha/expect-expect@1:1',
        'mocha/no-focused-tests@2:4',
        'mocha/no-identical-title@3:4',
        'nitpicker/no-fixed-sleep-synchronization@4:23',
        'nitpicker/no-interval-polling-in-tests@5:17',
      ],
      'mocha/wrong-runner.test.mjs': ['no-restricted-imports@1:1', 'no-restricted-imports@2:1'],
    });
  });
});
