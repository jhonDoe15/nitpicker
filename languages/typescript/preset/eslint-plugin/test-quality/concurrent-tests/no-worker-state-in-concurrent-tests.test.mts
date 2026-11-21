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
    lines(
      IMPORTS,
      "describe.concurrent('x', () => {",
      "  it('a', async () => { const service = make(); vi.spyOn(service, 'run'); await service.go(); });",
      "  it('b', async () => { const o = { f() {} }; vi.spyOn(o, 'f'); vi.spyOn(make(), 'g'); });",
      "  it('c', { concurrent: false }, async () => { vi.useFakeTimers(); });",
      '});',
    ),
    lines(
      IMPORTS,
      "describe.concurrent('x', () => { it('a', async () => { vi.useFakeTimers(); }); });",
      "describe.concurrent('y', () => { it('b', async () => {}); });",
    ),
    lines(
      IMPORTS,
      "describe.concurrent('x', () => {",
      "  it('a', async () => { vi.useFakeTimers(); });",
      "  it.skip('b', async () => {});",
      "  it.todo('c');",
      '});',
    ),
    lines(
      IMPORTS,
      "describe.concurrent('x', () => {",
      "  describe('clock', { concurrent: false }, () => { it('c', () => { vi.useFakeTimers(); }); });",
      OTHER,
      OTHER,
      '});',
    ),
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
