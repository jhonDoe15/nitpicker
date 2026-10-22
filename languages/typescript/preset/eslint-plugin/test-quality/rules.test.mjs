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
      errors: [{ messageId: 'copiedTest', data: { count: '2' }, line: 3 }],
    },
    {
      code: copies(5),
      errors: [
        { messageId: 'copiedTest', data: { count: '4' }, line: 3 },
        { messageId: 'copiedTest', data: { count: '4' }, line: 4 },
        { messageId: 'copiedTest', data: { count: '4' }, line: 5 },
      ],
    },
    {
      code: `describe('x', () => {\n${copies(3)}\n});`,
      errors: [{ messageId: 'copiedTest', data: { count: '2' }, line: 4 }],
    },
    {
      code: lines(
        "test('a', () => { expect(`id-${make('a')}`).toBe('x'); });",
        "test('b', () => { expect(`id-${make('b')}`).toBe('y'); });",
        "test('c', () => { expect(`id-${make('c')}`).toBe('z'); });",
      ),
      errors: [{ messageId: 'copiedTest', data: { count: '2' } }],
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
