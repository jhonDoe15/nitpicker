import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as fakeTimersRequireRestore } from './fake-timers-require-restore.mjs';
import { rule as noCopyPastedTests } from './no-copy-pasted-tests.mjs';
import { rule as noSharedTestState } from './no-shared-test-state.mjs';

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
const lines = (...parts) => parts.join('\n');
const EACH_CASE = 'give each case its own test with it.each';

tester.run('no-shared-test-state', noSharedTestState, {
  valid: [
    'const limit = 3;',
    'let handle; beforeEach(() => { handle = open(); });',
    "it('counts', () => { let calls = 0; run(() => { calls += 1; }); expect(calls).toBe(1); });",
    "describe('x', () => { let handle; beforeEach(() => { handle = open(); }); it('a', () => {}); });",
    "describe('x', () => { it('a', () => { let total = 0; expect(total).toBe(0); }); });",
    'for (let index = 0; index < 3; index += 1) { run(index); }',
    "describe('x', () => { if (flag) { let inner = 1; run(inner); } });",
  ],
  invalid: [
    {
      code: "let attempts = 0; it('a', () => { attempts += 1; });",
      errors: [{ messageId: 'sharedState', data: { name: 'attempts' } }],
    },
    {
      code: 'export let counter = 0;',
      errors: [{ messageId: 'sharedState', data: { name: 'counter' } }],
    },
    {
      code: "describe('x', () => { let calls = 0; it('a', () => { calls += 1; }); });",
      errors: [{ messageId: 'sharedState', data: { name: 'calls' } }],
    },
    {
      code: "describe.skip('x', () => { let calls = 0; });",
      errors: [{ messageId: 'sharedState', data: { name: 'calls' } }],
    },
    {
      code: 'let first = 1, second;',
      errors: [{ messageId: 'sharedState', data: { name: 'first' } }],
    },
  ],
});

const copies = (
  count,
  body = (index) => `expect(total(${String(index)})).toBe(${String(index * 2)});`,
) =>
  Array.from(
    { length: count },
    (_, index) => `it('case ${String(index)}', () => { ${body(index)} });`,
  ).join('\n');

tester.run('no-copy-pasted-tests', noCopyPastedTests, {
  valid: [
    copies(2),
    "it.each([[1, 2], [2, 4], [3, 6]])('doubles %s', (input, expected) => { expect(total(input)).toBe(expected); });",
    lines(
      "it('a', () => { expect(total(1)).toBe(2); });",
      "it('b', () => { expect(total(1)).toEqual(2); });",
      "it('c', () => { expect(other(1)).toBe(2); });",
    ),
    lines(
      "it('a', () => { expect(total(1)).toBe(2); });",
      "it('b', () => { expect(total(1)).toBe(2); expect(total(2)).toBe(4); });",
      "it('c', async () => { expect(total(1)).toBe(2); });",
    ),
    lines(
      "describe('a', () => { it('x', () => { expect(total(1)).toBe(2); }); });",
      "describe('b', () => { it('x', () => { expect(total(1)).toBe(2); }); });",
      "describe('c', () => { it('x', () => { expect(total(1)).toBe(2); }); });",
    ),
  ],
  invalid: [
    {
      code: copies(3),
      errors: [{ messageId: 'copiedTest', data: { count: '2', eachCase: EACH_CASE }, line: 3 }],
    },
    {
      code: copies(5),
      errors: [
        { messageId: 'copiedTest', data: { count: '4', eachCase: EACH_CASE }, line: 3 },
        { messageId: 'copiedTest', data: { count: '4', eachCase: EACH_CASE }, line: 4 },
        { messageId: 'copiedTest', data: { count: '4', eachCase: EACH_CASE }, line: 5 },
      ],
    },
    {
      code: `describe('x', () => {\n${copies(3)}\n});`,
      errors: [{ messageId: 'copiedTest', data: { count: '2', eachCase: EACH_CASE }, line: 4 }],
    },
    {
      code: lines(
        "test('a', () => { expect(`id-${make('a')}`).toBe('x'); });",
        "test('b', () => { expect(`id-${make('b')}`).toBe('y'); });",
        "test('c', () => { expect(`id-${make('c')}`).toBe('z'); });",
      ),
      errors: [{ messageId: 'copiedTest', data: { count: '2', eachCase: EACH_CASE } }],
    },
  ],
});

tester.run('fake-timers-require-restore', fakeTimersRequireRestore, {
  valid: [
    "it('real', () => { run(); });",
    "afterEach(() => { vi.useRealTimers(); }); it('fake', () => { vi.useFakeTimers(); });",
    'beforeEach(() => { vi.useFakeTimers(); }); afterEach(() => vi.useRealTimers());',
    'afterAll(() => { vi.useRealTimers(); }); beforeAll(() => { vi.useFakeTimers(); });',
    "it('fake', () => { vi.useFakeTimers(); try { run(); } finally { vi.useRealTimers(); } });",
    "import { vi as mocks } from 'vitest'; afterEach(() => mocks.useRealTimers()); mocks.useFakeTimers();",
    "describe('x', () => { afterEach(() => { vi.useRealTimers(); }); it('a', () => { vi.useFakeTimers(); }); });",
    "afterEach(vi.useRealTimers); it('a', () => { vi.useFakeTimers(); });",
    "it('a', ({ onTestFinished }) => { vi.useFakeTimers(); onTestFinished(() => vi.useRealTimers()); });",
    "it('a', () => { vi.stubGlobal('fetch', run); vi.stubEnv('MODE', 'x'); });",
    {
      code: "afterEach(vi.unstubAllGlobals); afterEach(() => { vi.unstubAllEnvs(); }); it('a', () => { vi.stubGlobal('fetch', run); vi.stubEnv('MODE', 'x'); });",
      options: [{ globals: true, envs: true }],
    },
  ],
  invalid: [
    {
      code: "it('fake', () => { vi.useFakeTimers(); run(); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: "it('fake', () => { vi.useFakeTimers(); run(); vi.useRealTimers(); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: "beforeEach(() => { vi.useFakeTimers(); }); it('a', () => {}); it('b', () => { vi.useFakeTimers(); });",
      errors: [{ messageId: 'unrestored' }, { messageId: 'unrestored' }],
    },
    {
      code: "import { vi } from 'vitest'; it('a', () => { try { vi.useRealTimers(); } finally { run(); } vi.useFakeTimers(); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: lines(
        "import userEvent from '@testing-library/user-event';",
        "it('clicks', async () => { vi.useFakeTimers(); await userEvent.setup().click(button); });",
      ),
      errors: [{ messageId: 'unrestoredWithUserEvent' }],
    },
    {
      code: "it('a', () => { vi.stubGlobal('fetch', run); vi.stubEnv('MODE', 'x'); vi.useRealTimers(); });",
      options: [{ globals: true, envs: true }],
      errors: [{ messageId: 'unrestoredGlobal' }, { messageId: 'unrestoredEnv' }],
    },
    {
      code: "it('a', () => { vi.stubGlobal('fetch', run); vi.stubEnv('MODE', 'x'); });",
      options: [{ globals: false, envs: true }],
      errors: [{ messageId: 'unrestoredEnv' }],
    },
  ],
});

tester.run('no-copy-pasted-tests names the table form of the runner', noCopyPastedTests, {
  valid: [],
  invalid: [
    {
      code: lines(
        "it('a', () => { assert.equal(add(1), 2); });",
        "it('b', () => { assert.equal(add(2), 3); });",
        "it('c', () => { assert.equal(add(3), 4); });",
      ),
      options: [{ runner: 'node' }],
      errors: [
        {
          messageId: 'copiedTest',
          data: {
            count: '2',
            eachCase:
              'give each case its own test: `for (const testCase of cases) { it(testCase.name, () => { ... }); }`',
          },
        },
      ],
    },
  ],
});

tester.run('fake-timers-require-restore under every runner', fakeTimersRequireRestore, {
  valid: [
    "afterEach(() => { jest.useRealTimers(); }); it('a', () => { jest.useFakeTimers(); });",
    "import { jest } from '@jest/globals'; afterAll(() => jest.useRealTimers()); jest.useFakeTimers();",
    "import { mock } from 'node:test'; afterEach(() => { mock.timers.reset(); }); it('a', () => { mock.timers.enable(); });",
    "import { mock } from 'node:test'; after(() => mock.reset()); before(() => { mock.timers.enable(); });",
    "test('a', (t) => { t.mock.timers.enable({ apis: ['Date'] }); });",
    'let clock; beforeEach(() => { clock = sinon.useFakeTimers(); }); afterEach(() => { clock.restore(); });',
    "import sinon from 'sinon'; afterEach(() => sinon.restore()); it('a', () => { sinon.useFakeTimers(); });",
    "import FakeTimers from '@sinonjs/fake-timers'; let clock; beforeEach(() => { clock = FakeTimers.install(); }); afterEach(() => clock.uninstall());",
    "it('a', () => { jest.useFakeTimers(); try { run(); } finally { jest.useRealTimers(); } });",
  ],
  invalid: [
    {
      code: "it('a', () => { jest.useFakeTimers(); run(); });",
      errors: [
        {
          messageId: 'unrestored',
          data: { restore: '`afterEach(() => { jest.useRealTimers(); });`' },
        },
      ],
    },
    {
      code: "import { mock } from 'node:test'; afterEach(() => { mock.restoreAll(); }); it('a', () => { mock.timers.enable(); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: "import sinon from 'sinon'; it('a', () => { const clock = sinon.useFakeTimers(); clock.tick(10); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: "afterEach(() => { vi.useRealTimers(); }); it('a', () => { jest.useFakeTimers(); });",
      errors: [{ messageId: 'unrestored' }],
    },
    {
      code: lines(
        "import userEvent from '@testing-library/user-event';",
        "it('clicks', async () => { jest.useFakeTimers(); await userEvent.setup().click(button); });",
      ),
      errors: [
        {
          messageId: 'unrestoredWithUserEvent',
          data: {
            restore: '`afterEach(() => { jest.useRealTimers(); });`',
            advance: 'jest.advanceTimersByTime',
          },
        },
      ],
    },
  ],
});
