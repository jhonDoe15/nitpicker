import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { RUNNER_RULE_NAMESPACES, testRunnerLintConfig } from './runner-rules.mjs';

async function findings(runner, code) {
  const config = await testRunnerLintConfig(runner);
  const messages = new Linter().verify(code, [
    {
      files: ['**/*.js'],
      plugins: config.plugins,
      settings: config.settings,
      languageOptions: { sourceType: 'module', globals: config.globals },
      rules: config.rules,
    },
  ]);
  return messages.map(({ ruleId }) => ruleId);
}

const NODE_HEAD = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";
const NODE_NAMED_HEAD =
  "import { describe, it } from 'node:test';\nimport assert from 'node:assert';\n";

describe('the test file rules follow the runner', () => {
  it('names one namespace per runner', () => {
    expect(RUNNER_RULE_NAMESPACES).toEqual(['vitest', 'jest', 'node-test', 'mocha']);
  });

  it.each([
    ['vitest', "it('a', () => {});", 'vitest/expect-expect'],
    ['jest', "it('a', () => {});", 'jest/expect-expect'],
    ['mocha', "it('a', () => {});", 'mocha/expect-expect'],
    ['node', `${NODE_HEAD}test('a', () => {});`, 'node-test/expect-expect'],
    ['node', `${NODE_NAMED_HEAD}it('a', () => {});`, 'node-test/expect-expect'],
    ['node', "const test = require('node:test');\ntest('a', () => {});", 'node-test/expect-expect'],
  ])('flags a test without an assertion on %s', async (runner, code, ruleId) => {
    expect(await findings(runner, code)).toEqual([ruleId]);
  });

  it.each([
    ['vitest', "it('a', () => { expect(1).toBe(1); });"],
    ['jest', "it('a', () => { expect(1).toBe(1); });"],
    ['mocha', "it('a', () => { expect(1).to.equal(1); });"],
    ['mocha', "it('a', () => { assert.equal(1, 1); });"],
    ['node', `${NODE_HEAD}test('a', () => { assert.equal(1, 1); });`],
    ['node', `${NODE_HEAD}test('a', () => { assert(true); });`],
    ['node', `${NODE_NAMED_HEAD}it('a', (t) => { t.assert.ok(true); });`],
  ])('accepts the assertions the %s project uses', async (runner, code) => {
    expect(await findings(runner, code)).toEqual([]);
  });

  it.each([
    ['vitest', "it.only('a', () => { expect(1).toBe(1); });", 'vitest/no-focused-tests'],
    ['jest', "it.only('a', () => { expect(1).toBe(1); });", 'jest/no-focused-tests'],
    ['mocha', "it.only('a', () => { expect(1).to.equal(1); });", 'mocha/no-focused-tests'],
    ['node', `${NODE_HEAD}test.only('a', () => { assert.ok(1); });`, 'node-test/no-focused-tests'],
    [
      'node',
      `${NODE_NAMED_HEAD}it.only('a', () => { assert.ok(1); });`,
      'node-test/no-focused-tests',
    ],
  ])('flags a focused test on %s', async (runner, code, ruleId) => {
    expect(await findings(runner, code)).toEqual([ruleId]);
  });

  it.each([
    ['jest', 'jest/no-identical-title'],
    ['mocha', 'mocha/no-identical-title'],
  ])('flags duplicate titles on %s', async (runner, ruleId) => {
    const code = "it('a', () => { assert.ok(1); });\nit('a', () => { assert.ok(1); });";

    expect(await findings(runner, code)).toEqual([ruleId]);
  });

  it('flags duplicate titles on node:test through either import style', async () => {
    const duplicate = "('a', () => { assert.ok(1); });\n";
    const named = `${NODE_NAMED_HEAD}it${duplicate}it${duplicate}`;
    const whole = `${NODE_HEAD}test${duplicate}test${duplicate}`;

    expect(await findings('node', named)).toEqual(['node-test/no-identical-title']);
    expect(await findings('node', whole)).toEqual(['node-test/no-identical-title']);
  });

  it('flags a conditional inside a test on every runner', async () => {
    const body = "it('a', () => { if (x) { assert.ok(1); } });";

    expect(await findings('vitest', body)).toContain('vitest/no-conditional-in-test');
    expect(await findings('jest', body)).toContain('jest/no-conditional-in-test');
    expect(await findings('mocha', body)).toContain('mocha/no-conditional-in-test');
    expect(await findings('node', `${NODE_NAMED_HEAD}${body}`)).toContain(
      'node-test/no-conditional-in-test',
    );
  });

  it('does not treat other modules named test as node:test', async () => {
    const code = "import test from 'ava';\ntest('a', () => {});\ntest('a', () => {});";

    expect(await findings('node', code)).toEqual([]);
  });

  it('leaves the Vitest-only rule about node:test imports to Vitest projects', async () => {
    const code = "import { test } from 'node:test';\ntest('a', () => { expect(1).toBe(1); });";

    expect(await findings('vitest', code)).toContain('vitest/no-import-node-test');
    expect(await findings('node', code)).toEqual([]);
  });
});
