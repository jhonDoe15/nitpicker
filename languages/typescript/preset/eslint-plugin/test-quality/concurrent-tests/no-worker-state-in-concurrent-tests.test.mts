import { rule } from './no-worker-state-in-concurrent-tests.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';

const tester = typescriptRuleTester();
const lines = (...parts: string[]) => parts.join('\n');
const IMPORTS = "import { describe, it, test, vi, beforeEach } from 'vitest';";
const state = (what: string) => ({ messageId: 'workerState', data: { what } });
const timers = state('fake timers');
const OTHER = "  it('sends', async () => { await send(); });";

tester.run('no-worker-state-in-concurrent-tests', rule, {
  valid: [
    lines(
      IMPORTS,
      "describe('billing', () => {",
      "  it('a', () => { vi.useFakeTimers(); });",
      OTHER,
      '});',
    ),
    lines(
      IMPORTS,
      "it.concurrent('a', async () => { vi.useFakeTimers(); });",
      "it('b', () => {});",
    ),
    lines(
      IMPORTS,
      "describe.concurrent('billing', () => {",
      "  it('a', async () => { const local = vi.fn(); local.mockReturnValue(1); await run(local); });",
      OTHER,
      "  describe.sequential('clock', () => { it('c', () => { vi.useFakeTimers(); }); });",
      '});',
    ),
    lines(
      IMPORTS,
      "describe('billing', { concurrent: true }, () => {",
      "  describe('clock', { sequential: true }, () => { it('c', () => { vi.useFakeTimers(); }); });",
      OTHER,
      OTHER,
      '});',
    ),
    {
      code: lines(IMPORTS, "it('a', () => { vi.useFakeTimers(); });", "it('b', () => {});"),
      options: [{ concurrent: false }],
    },
  ],
  invalid: [
    {
      code: lines(
        IMPORTS,
        'const send = vi.fn();',
        "describe.concurrent('billing', () => {",
        "  beforeEach(() => { vi.spyOn(console, 'warn'); });",
        "  it('renews', async () => { vi.useFakeTimers(); vi.setSystemTime(0); await renew(); });",
        "  it('sends', async () => { process.env.MODE = 'x'; delete process.env.OTHER; send.mockResolvedValue(1); await run(); });",
        '});',
      ),
      errors: [
        state('a spy'),
        timers,
        state('the fake clock'),
        state('the write to `process.env`'),
        state('the write to `process.env`'),
        state('the implementation set on a mock declared outside the test'),
      ],
    },
    {
      code: lines(
        IMPORTS,
        "test.concurrent('a', async () => { vi.stubEnv('MODE', 'x'); process.chdir('/tmp'); });",
        "test.concurrent('b', async () => { vi.stubGlobal('fetch', run); });",
      ),
      errors: [
        state('a stubbed environment variable'),
        state('the working directory change'),
        state('a stubbed global'),
      ],
    },
    {
      code: lines(
        IMPORTS,
        "it.concurrent.each([1, 2])('a %s', async () => { vi.useFakeTimers(); });",
      ),
      errors: [timers],
    },
    {
      code: lines(
        IMPORTS,
        "it('a', async () => { vi.useFakeTimers(); });",
        "it('b', async () => {});",
      ),
      options: [{ concurrent: true }],
      errors: [timers],
    },
  ],
});
