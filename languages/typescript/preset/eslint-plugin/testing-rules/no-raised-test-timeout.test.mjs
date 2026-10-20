import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noRaisedTestTimeout } from '../rules/testing/assertions/no-raised-test-timeout.mjs';

RuleTester.afterAll = afterAll;

RuleTester.afterEach = afterEach;

RuleTester.beforeAll = beforeAll;

RuleTester.beforeEach = beforeEach;

RuleTester.describe = describe;

RuleTester.it = it;

RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

const testFile = '/repo/tests/integration/repository.test.ts';
const lines = (...parts) => parts.join('\n');
ruleTester.run('no-raised-test-timeout', noRaisedTestTimeout, {
  valid: [
    {
      filename: testFile,
      code: "it('JVM build in JS test', () => {}, 120_000); beforeAll(() => {}, 180_000);",
      settings: {
        nitpickerTestTimeoutPolicy: {
          tools: {
            tests: {
              timeouts: {
                languages: {
                  java: { testDeclarationCeilingMs: 120_000, hookDeclarationCeilingMs: 180_000 },
                },
                projects: { jvm: { language: 'java', include: ['**/tests/integration/**'] } },
              },
            },
          },
        },
      },
    },
    { filename: testFile, code: "it('runs', () => {});" },
    { filename: testFile, code: "it('runs', () => {}, 10_000);" },
    { filename: testFile, code: "const LIMIT = 5 * 1000; test('runs', async () => {}, LIMIT);" },
    { filename: testFile, code: "it('retries', { retry: 2 }, () => {});" },
    { filename: testFile, code: "it.each([1, 2])('case %s', () => {}, 2000);" },
    { filename: testFile, code: 'beforeAll(() => setup(), 10_000);' },
    { filename: testFile, code: "describe('suite', () => { it('runs', () => {}); });" },
    { filename: testFile, code: 'setTimeout(() => done(), 60_000);' },
    {
      filename: testFile,
      code: 'vi.setConfig({ testTimeout: 5000, sequence: { shuffle: true } });',
    },
    ...[
      "it('long build', () => {}, 60_000);",
      'beforeAll(() => setup(), 90_000);',
      'vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });',
    ].map((code) => ({
      filename: testFile,
      code,
      settings: {
        nitpickerTestTimeoutPolicy: {
          tools: {
            tests: {
              timeouts: {
                defaults: { testDeclarationCeilingMs: 60_000, hookDeclarationCeilingMs: 90_000 },
              },
            },
          },
        },
      },
    })),
  ],
  invalid: [
    ...["it('disabled', () => {}, 0);", 'beforeAll(() => {}, -1);'].map((code) => ({
      filename: testFile,
      code,
      errors: [{ messageId: 'raisedTimeout' }],
    })),
    {
      filename: testFile,
      code: "it('too long', () => {}, 60_001); beforeAll(() => {}, 90_001);",
      settings: {
        nitpickerTestTimeoutPolicy: {
          tools: {
            tests: {
              timeouts: {
                defaults: { testDeclarationCeilingMs: 60_000, hookDeclarationCeilingMs: 90_000 },
              },
            },
          },
        },
      },
      errors: [
        { messageId: 'raisedTimeout', data: { ceiling: '60000', kind: 'test' } },
        { messageId: 'raisedTimeout', data: { ceiling: '90000', kind: 'hook' } },
      ],
    },
    {
      filename: '/repo/tests/integration/strict-clean.test.ts',
      code: lines(
        'const FIXTURE_TIMEOUT_MS = 300_000;',
        "it('passes --all', () => { run(); }, FIXTURE_TIMEOUT_MS);",
      ),
      errors: [{ messageId: 'raisedTimeout', line: 2 }],
    },
    {
      filename: '/repo/tests/integration/eslint-diff-policy.test.ts',
      code: lines(
        "it('compares', () => {}, 60_000);",
        "it('compares typed', async () => {}, 120_000);",
      ),
      errors: [{ messageId: 'raisedTimeout' }, { messageId: 'raisedTimeout' }],
    },
    {
      filename: testFile,
      code: lines(
        "it('object form', { timeout: 60_000 }, () => {});",
        "describe('suite', { timeout: 20_000 }, () => {});",
        'beforeAll(async () => setup(), 5 * 60 * 1000);',
        'vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });',
        "it.concurrent('fast?', async () => {}, 11_000);",
      ),
      errors: [
        { messageId: 'raisedTimeout', line: 1 },
        { messageId: 'raisedTimeout', line: 2 },
        { messageId: 'raisedTimeout', line: 3 },
        { messageId: 'raisedTimeout', line: 4 },
        { messageId: 'raisedTimeout', line: 4 },
        { messageId: 'raisedTimeout', line: 5 },
      ],
    },
    {
      filename: testFile,
      code: "it('computed', () => {}, Number(process.env.SLOW_TIMEOUT));",
      errors: [{ messageId: 'unknownTimeout' }],
    },
  ],
});
