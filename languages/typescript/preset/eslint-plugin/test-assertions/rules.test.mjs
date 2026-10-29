import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noPartialOutputAssertion } from '../rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const filename = '/repo/test/report.test.ts';

tester.run('no-switched-off-tests', noSwitchedOffTests, {
  valid: [
    "it('x', () => { expect(run()).toBe(1); });",
    "it.skipIf(process.platform === 'win32')('x', () => {});",
    "it.runIf(isCi)('x', () => {});",
    "it.skipIf(flag)('x', () => {});",
    "it.each([1])('x', () => {});",
    'const plan = { todo: 1 }; plan.todo = 2; items.fails = 3;',
    'const pending = tasks.todo;',
    "it.fails('known bug', () => { expect(run()).toBe(2); });",
    "test.fails.each([1])('known bug', () => {});",
    "it.skipIf(process.env.CI === '1')('x', () => {});",
    "it.skipIf(typeof window === 'undefined')('x', () => {});",
    "it.runIf(flag && true)('x', () => {});",
    "it.skipIf(a === 1)('x', () => {});",
    "it.skipIf(`${flag}`)('x', () => {});",
    "it.skipIf(...flags)('x', () => {});",
  ],
  invalid: [
    { code: "it.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "test.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "describe.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "it('x', () => {}); it.concurrent.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "it.skipIf(true)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    { code: "it.runIf(false)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    { code: "describe.runIf(false)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    {
      code: "test.skipIf(true).each([1])('x', () => {});",
      errors: [{ messageId: 'literalCondition' }],
    },
    ...[
      '1 === 1',
      '!false',
      '!0',
      '1',
      '0',
      "''",
      'null',
      'undefined',
      'true && true',
      'false || true',
      'true ? true : false',
      "'a' === 'a'",
      '1 + 1 > 1',
      'typeof 1 === "number"',
      'void 0',
      '`on`',
      'NaN',
    ].flatMap((condition) => [
      {
        code: `it.skipIf(${condition})('x', () => {});`,
        errors: [{ messageId: 'literalCondition' }],
      },
      {
        code: `it.runIf(${condition})('x', () => {});`,
        errors: [{ messageId: 'literalCondition' }],
      },
    ]),
  ],
});

tester.run('no-partial-output-assertion for toMatch', noPartialOutputAssertion, {
  valid: [
    { filename, code: 'expect(id).toMatch(/^[0-9a-f]{8}$/);' },
    { filename, code: 'expect(id).toMatch(/^\\d+$/u);' },
    { filename, code: 'expect(output).not.toMatch(/secret/);' },
    { filename, code: 'expect(output).toMatch(pattern);' },
    { filename, code: "text.toMatch('a');" },
  ],
  invalid: [
    {
      filename,
      code: 'expect(output).toMatch(/total: 3/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/^total/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/total$/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/cost \\$/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: "expect(output).toMatch('total: 3');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(`line ${n}`);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'await expect(run()).resolves.toMatch(/done/);',
      errors: [{ messageId: 'partialOutput' }],
    },
  ],
});
