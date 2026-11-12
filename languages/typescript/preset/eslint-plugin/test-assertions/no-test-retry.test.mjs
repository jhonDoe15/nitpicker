import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noTestRetry } from './no-test-retry.mjs';

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

const filename = '/repo/tests/unit/service.test.ts';
const lines = (...parts) => parts.join('\n');
const invalid = (code, count = 1) => ({
  filename,
  code,
  errors: Array.from({ length: count }, () => ({ messageId: 'retry' })),
});

ruleTester.run('no-test-retry', noTestRetry, {
  valid: [
    "it('runs', () => {});",
    "it('runs', { timeout: 5000 }, () => {});",
    "it('runs', { retry: 0 }, () => {});",
    "test('runs', () => {}, { retries: 0 });",
    "const NONE = 0; it('runs', { retry: NONE }, () => {});",
    "const options = { retry: 0 }; describe('suite', options, () => {});",
    "it.each([1, 2])('case %s', (value) => {});",
    "describe('suite', () => { it('runs', () => {}); });",
    "it('runs', { retries: { runMode: 0, openMode: 0 } }, () => {});",
    'vi.setConfig({ testTimeout: 5000 });',
    'vi.setConfig({ retry: 0 });',
    'jest.retryTimes(0);',
    'jest.setTimeout(5000);',
    "describe('suite', function () { this.timeout(5000); this.retries(0); });",
    "describe('suite', function () { const current = this.retries(); });",
    "describe('suite', () => { this.retries(3); });",
    'class Client { retry() { this.retries(3); } }',
    "test.describe.configure({ mode: 'parallel' });",
    'test.describe.configure({ retries: 0 });',
    'client.retry({ retries: 3 });',
    'retryRequest(() => {}, { retries: 3 });',
    "foo('runs', { retry: 2 }, () => {});",
    "it('runs', { ...shared }, () => {});",
    "it('runs', { retry: false }, () => {}); it('runs', { retries: undefined }, () => {});",
    "it('runs', { retry: null }, () => {});",
    "it('runs', { retry: 0 } as const, () => {});",
    "const options = { retry: 0 } satisfies Options; it('runs', options!, () => {});",
    "const base = { retry: 0 }; it('runs', { ...base }, () => {});",
    "it('runs', cond ? { retry: 0 } : {}, () => {});",
    '[1].forEach(function () { this.retries(3); });',
    'cb(function () { this.retries(3); });',
    "function helper() { this.retries(3); } describe('suite', function () { helper.call(this); });",
    "import { it as spec } from 'other'; spec('x', { retry: 2 }, () => {});",
    'const { retryTimes } = jest; retryTimes(2);',
    "const options = loadOptions(); it('runs', options, () => {});",
    "import { options } from './options.js'; it('runs', options, () => {});",
  ].map((code) => ({ filename, code })),
  invalid: [
    invalid("it('flaky', { retry: 2 }, () => {});"),
    invalid("it('flaky', { retry: 2 } as const, () => {});"),
    invalid("const options = { retry: 2 } as const; it('flaky', options, () => {});"),
    invalid("const options = { retry: 2 } satisfies Options; it('flaky', options!, () => {});"),
    invalid("const options = { retry: 2 }; it('flaky', { ...options }, () => {});"),
    invalid('const options = { retry: 2 }; vi.setConfig({ ...options });'),
    invalid("const a = { retry: 2 }; const b = { ...a }; it('flaky', { ...b }, () => {});"),
    invalid("it('flaky', cond ? { retry: 2 } : {}, () => {});"),
    invalid("it('flaky', cond ? {} : { retries: 2 }, () => {});"),
    invalid(
      "const options = { retry: 2 }; it('a', options, () => {}); it('b', options, () => {});",
    ),
    invalid("import { it as spec } from 'vitest'; spec('flaky', { retry: 2 }, () => {});"),
    invalid(
      "import { test as base } from '@playwright/test'; base('x', { retries: 2 }, () => {});",
    ),
    invalid("import { jest as j } from '@jest/globals'; j.retryTimes(2);"),
    invalid("import { vi as v } from 'vitest'; v.setConfig({ retry: 2 });"),
    invalid(
      "import { describe as suiteOf } from 'mocha'; suiteOf('x', function () { this.retries(2); });",
    ),
    invalid("jest['retryTimes'](2);"),
    invalid("describe('suite', function () { this['retries'](2); });"),
    invalid("context('suite', function () { specify('x', function () { this.retries(2); }); });"),
    invalid('beforeEach(function () { this.retries(2); });'),
    invalid('test.describe.serial.configure({ retries: 2 });'),
    invalid('test.describe.parallel.configure({ retries: 2 });'),
    invalid('jest.retryTimes(3 as number);'),
    invalid("test('x', { retries: 2 }, async ({ page }) => {});"),
    invalid("test('flaky', { retries: 2 }, async () => {});"),
    invalid("it('flaky', () => {}, { retry: 2 });"),
    invalid("describe('suite', { retry: 3 }, () => {});"),
    invalid("suite('suite', { retries: 3 }, () => {});"),
    invalid("it.concurrent('flaky', { retry: 1 }, async () => {});"),
    invalid("describe.sequential('suite', { retry: 1 }, () => {});"),
    invalid("test.only('flaky', { retries: 1 }, () => {});"),
    invalid("it.skip.each([1, 2])('case %s', { retry: 1 }, () => {});"),
    invalid("it.each([1, 2])('case %s', { retry: 1 }, () => {});"),
    invalid("it('flaky', { retries: { runMode: 2, openMode: 0 } }, () => {});"),
    invalid("const options = { retry: 2 }; it('flaky', options, () => {});"),
    invalid("const RETRIES = 3; it('flaky', { retries: RETRIES }, () => {});"),
    invalid("it('flaky', { retry: Number(process.env.RETRIES) }, () => {});"),
    invalid("it('flaky', { retry: true }, () => {});"),
    invalid("it('flaky', { 'retry': 2 }, () => {});"),
    invalid('vi.setConfig({ retry: 2 });'),
    invalid('vi.setConfig({ testTimeout: 5000, retry: 1 });'),
    invalid('jest.retryTimes(3);'),
    invalid('jest.retryTimes(3, { logErrorsBeforeRetry: true });'),
    invalid("describe('suite', function () { this.retries(2); });"),
    invalid("it('flaky', function () { this.retries(2); });"),
    invalid('before(function () { if (process.env.CI) { this.retries(2); } });'),
    invalid('test.describe.configure({ retries: 2 });'),
    invalid("test.describe.configure({ mode: 'serial', retries: 2 });"),
    invalid(
      lines(
        'const retries = Number(process.env.RETRIES);',
        'test.describe.configure({ retries });',
      ),
    ),
    invalid(lines("it('a', { retry: 1 }, () => {});", "it('b', { retry: 2 }, () => {});"), 2),
  ],
});
