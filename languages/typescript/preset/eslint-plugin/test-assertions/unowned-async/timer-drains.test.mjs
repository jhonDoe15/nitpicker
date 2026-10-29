import { runCases } from './test-support/rule-cases.mjs';

const TIMER = 'setTimeout(() => { expect(a).toBe(1); }, 1000);';

runCases('no-unowned-async-assertion timers drained by a later wait', {
  valid: [
    `it('x', async () => { ${TIMER} await sleep(1000); });`,
    `it('x', async () => { ${TIMER} await delay(2000); });`,
    `it('x', async () => { ${TIMER} await new Promise((r) => setTimeout(r, 1500)); });`,
    `it('x', async () => { ${TIMER} await page.waitForTimeout(1000); });`,
    `it('x', async () => { ${TIMER} await waitFor(() => expect(seen).toBe(true)); });`,
    `it('x', async () => { ${TIMER} await vi.waitFor(() => expect(seen).toBe(true)); });`,
    `it('x', async () => { ${TIMER} await expect.poll(() => seen).toBe(true); });`,
    `it('x', async () => { ${TIMER} await screen.findByText('done'); });`,
    `it('x', async () => { ${TIMER} await Promise.all([sleep(1000), load()]); });`,
    `it('x', () => { ${TIMER} return sleep(1000); });`,
    `it('x', async () => { ${TIMER} await act(async () => { await sleep(1000); }); });`,
    "it('x', async () => { setTimeout(() => expect(a).toBe(1), wait); await sleep(10); });",
    "it('x', async () => { setTimeout(() => expect(a).toBe(1)); await sleep(0); });",
    "it('x', async () => { queueMicrotask(() => expect(a).toBe(1)); await Promise.resolve(); });",
    "it('x', async () => { process.nextTick(() => expect(a).toBe(1)); await load(); });",
  ],
  invalid: [
    [`it('late', async () => { ${TIMER} await Promise.resolve(); });`, 'timer', 'setTimeout'],
    [`it('x', async () => { ${TIMER} await load(); });`, 'timer', 'setTimeout'],
    [`it('x', async () => { ${TIMER} await sleep(10); });`, 'timer', 'setTimeout'],
    [
      `it('x', async () => { ${TIMER} await new Promise((r) => setTimeout(r, 10)); });`,
      'timer',
      'setTimeout',
    ],
    [
      `it('x', async () => { ${TIMER} await Promise.all([load(), save()]); });`,
      'timer',
      'setTimeout',
    ],
    [`it('x', () => { ${TIMER} return load(); });`, 'timer', 'setTimeout'],
    [
      `it('x', async () => { ${TIMER} await act(async () => { await load(); }); });`,
      'timer',
      'setTimeout',
    ],
    [
      `it('x', async () => { ${TIMER} for await (const item of items) { use(item); } });`,
      'timer',
      'setTimeout',
    ],
    [
      "it('x', async () => { setImmediate(() => expect(a).toBe(1)); await Promise.resolve(); });",
      'timer',
      'setImmediate',
    ],
  ],
});
