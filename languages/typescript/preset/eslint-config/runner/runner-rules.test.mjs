import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { RUNNER_RULE_NAMESPACES, testRunnerLintConfig } from './runner-rules.mjs';

function lint(runner, code) {
  const config = testRunnerLintConfig(runner);
  return new Linter().verify(code, [
    {
      files: ['**/*.js'],
      plugins: config.plugins,
      settings: config.settings,
      languageOptions: { sourceType: 'module', globals: config.globals },
      rules: config.rules,
    },
  ]);
}

function findings(runner, code) {
  return lint(runner, code).map(({ ruleId }) => ruleId);
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
  ])('flags a test without an assertion on %s', (runner, code, ruleId) => {
    expect(findings(runner, code)).toEqual([ruleId]);
  });

  it.each([
    ['vitest', "it('a', () => { expect(1).toBe(1); });"],
    ['jest', "it('a', () => { expect(1).toBe(1); });"],
    ['mocha', "it('a', () => { expect(1).to.equal(1); });"],
    ['mocha', "it('a', () => { assert.equal(1, 1); });"],
    ['node', `${NODE_HEAD}test('a', () => { assert.equal(1, 1); });`],
    ['node', `${NODE_HEAD}test('a', () => { assert(true); });`],
    ['node', `${NODE_NAMED_HEAD}it('a', (t) => { t.assert.ok(true); });`],
  ])('accepts the assertions the %s project uses', (runner, code) => {
    expect(findings(runner, code)).toEqual([]);
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
  ])('flags a focused test on %s', (runner, code, ruleId) => {
    expect(findings(runner, code)).toEqual([ruleId]);
  });

  it.each([
    ['jest', 'jest/no-identical-title'],
    ['mocha', 'mocha/no-identical-title'],
  ])('flags duplicate titles on %s', (runner, ruleId) => {
    const code = "it('a', () => { assert.ok(1); });\nit('a', () => { assert.ok(1); });";

    expect(findings(runner, code)).toEqual([ruleId]);
  });

  it('flags duplicate titles on node:test through either import style', () => {
    const duplicate = "('a', () => { assert.ok(1); });\n";
    const named = `${NODE_NAMED_HEAD}it${duplicate}it${duplicate}`;
    const whole = `${NODE_HEAD}test${duplicate}test${duplicate}`;

    expect(findings('node', named)).toEqual(['node-test/no-identical-title']);
    expect(findings('node', whole)).toEqual(['node-test/no-identical-title']);
  });

  it.each([
    ['vitest', "it('a', () => { if (x) { assert.ok(1); } });", 'vitest'],
    ['jest', "it('a', () => { if (x) { assert.ok(1); } });", 'jest'],
    ['mocha', "it('a', () => { if (x) { assert.ok(1); } });", 'mocha'],
    ['node', `${NODE_NAMED_HEAD}it('a', () => { if (x) { assert.ok(1); } });`, 'node-test'],
  ])('flags a conditional inside a %s test', (runner, code, namespace) => {
    expect(findings(runner, code)).toEqual([`${namespace}/no-conditional-in-test`]);
  });

  it('does not treat other modules named test as node:test', () => {
    const code = "import test from 'ava';\ntest('a', () => {});\ntest('a', () => {});";

    expect(findings('node', code)).toEqual([]);
  });

  it('leaves the Vitest-only rule about node:test imports to Vitest projects', () => {
    const code = "import { test } from 'node:test';\ntest('a', () => { expect(1).toBe(1); });";

    expect(findings('vitest', code)).toEqual([
      'vitest/no-import-node-test',
      'vitest/no-standalone-expect',
    ]);
    expect(findings('node', code)).toEqual([]);
  });

  it.each([
    ['jest', 'vitest'],
    ['jest', 'node:test'],
    ['jest', 'mocha'],
    ['mocha', 'vitest'],
    ['mocha', 'node:test'],
    ['mocha', '@jest/globals'],
    ['node', 'vitest'],
    ['node', '@jest/globals'],
    ['node', 'mocha'],
    ['vitest', '@jest/globals'],
    ['vitest', 'mocha'],
  ])('flags a %s test that imports the test functions of %s', (runner, module) => {
    expect(
      findings(runner, `import { describe } from '${module}';\ndescribe('a', () => {});`),
    ).toEqual(['no-restricted-imports']);
  });

  it.each([
    ['vitest', 'vitest'],
    ['jest', '@jest/globals'],
    ['node', 'node:test'],
    ['mocha', 'mocha'],
  ])('lets a %s test import its own runner %s', (runner, module) => {
    expect(
      findings(runner, `import { describe } from '${module}';\ndescribe('a', () => {});`),
    ).toEqual([]);
  });

  it('tells a Jest project that imports vitest which runner it runs and how to change it', () => {
    const [{ message }] = lint('jest', "import { it } from 'vitest';");

    expect(message).toBe(
      "'vitest' import is restricted from being used. nitpicker runs this project's tests with Jest, " +
        'which does not run Vitest tests. Take the test functions from `@jest/globals` or the Jest globals, or, if the project runs its tests with Vitest, ' +
        'set "tools.tests.runner" to "vitest" in nitpicker.config.json. If this file needs the module for another reason, ' +
        'add an exception for no-restricted-imports for it in nitpicker.config.json.',
    );
  });
});
