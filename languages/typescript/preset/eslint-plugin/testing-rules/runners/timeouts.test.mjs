import { rule as noRaisedTestTimeout } from '../../rules/testing/assertions/no-raised-test-timeout.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';

const ruleTester = typescriptRuleTester();
const filename = '/repo/tests/integration/slow.test.ts';

ruleTester.run('no-raised-test-timeout across runners', noRaisedTestTimeout, {
  valid: [
    'jest.setTimeout(5000);',
    'jest.setTimeout(10_000);',
    "describe('suite', function () { this.timeout(5000); });",
    "it('runs', function () { this.timeout(10_000); });",
    "it('runs', () => {}).timeout(2000);",
    "it('runs', async () => {}, { timeout: 5000 });",
    "test('runs', { timeout: 5000 }, async () => {});",
    'before(async () => setup(), 10_000);',
    'after(() => teardown());',
    'before(() => setup(), { timeout: 5000 });',
    'other.timeout(60_000); clock.setTimeout(60_000); jest.useFakeTimers(60_000);',
    'const options = { timeout: 5000 }; before(() => setup(), options);',
    'this.timeout();',
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: 'jest.setTimeout(30_000);', errors: [{ messageId: 'raisedTimeout' }] },
    { code: 'jest.setTimeout(LIMIT);', errors: [{ messageId: 'unknownTimeout' }] },
    {
      code: "describe('suite', function () { this.timeout(60_000); });",
      errors: [{ messageId: 'raisedTimeout' }],
    },
    {
      code: "it('runs', function () { this.timeout(20 * 1000); });",
      errors: [{ messageId: 'raisedTimeout' }],
    },
    {
      code: "it('runs', () => {}).timeout(20_000);",
      errors: [{ messageId: 'raisedTimeout' }],
    },
    {
      code: "describe('suite', () => {}).timeout(compute());",
      errors: [{ messageId: 'unknownTimeout' }],
    },
    { code: 'before(async () => setup(), 60_000);', errors: [{ messageId: 'raisedTimeout' }] },
    { code: 'after(async () => teardown(), 60_000);', errors: [{ messageId: 'raisedTimeout' }] },
    {
      code: 'before(() => setup(), { timeout: 60_000 });',
      errors: [{ messageId: 'raisedTimeout' }],
    },
    {
      code: 'const options = { timeout: 60_000 }; after(() => teardown(), options);',
      errors: [{ messageId: 'raisedTimeout' }],
    },
    {
      code: "it('runs', async () => {}, { timeout: 60_000 });",
      errors: [{ messageId: 'raisedTimeout' }],
    },
  ].map((entry) => ({ filename, ...entry })),
});

const namedProjectSettings = {
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
};

ruleTester.run('named timeout tiers across runners', noRaisedTestTimeout, {
  valid: [
    'jest.setTimeout(120_000);',
    "it('runs', () => {}).timeout(120_000);",
    "test('runs', { timeout: 120_000 }, async () => {});",
    'before(() => setup(), { timeout: 180_000 });',
  ].map((code) => ({ filename, code, settings: namedProjectSettings })),
  invalid: [
    {
      code: 'jest.setTimeout(120_001);',
      errors: [{ messageId: 'raisedTimeout', data: { ceiling: '120000', kind: 'test' } }],
    },
    {
      code: 'before(() => setup(), { timeout: 180_001 });',
      errors: [{ messageId: 'raisedTimeout', data: { ceiling: '180000', kind: 'hook' } }],
    },
  ].map((entry) => ({ filename, settings: namedProjectSettings, ...entry })),
});
