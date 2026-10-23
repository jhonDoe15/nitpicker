import { runCases } from './test-support/rule-cases.mjs';

runCases('no-unowned-async-assertion owners inside nested statements and callbacks', {
  valid: [
    "test('x', async ({ page }) => { await test.step('s', async () => { page.on('dialog', (d) => expect(d.message()).toBe('x')); await page.click('#b'); }); });",
    "it('x', async () => { await test.step('s', async () => { setTimeout(() => expect(a).toBe(1), 10); await sleep(20); }); });",
    "it('x', async () => { await withServer(async (server) => { server.on('request', (r) => expect(r.url).toBe('/')); await fetch(url); }); });",
    "it('x', () => { if (c) { em.on('a', (v) => expect(v).toBe(1)); em.emit('a', 1); } });",
    "it('x', () => { for (const n of ns) { em.on('a', (v) => expect(v).toBe(n)); em.emit('a', n); } });",
    "it('x', () => { try { em.on('a', (v) => expect(v).toBe(1)); em.emit('a', 1); } finally { em.removeAllListeners(); } });",
    "it('x', () => { switch (kind) { case 1: em.on('a', (v) => expect(v).toBe(1)); em.emit('a', 1); break; } });",
    "it('x', async () => { await (async () => { em.on('a', (v) => expect(v).toBe(1)); await go(); })(); });",
    "it('x', () => { setup(); emitter.emit('a'); function setup() { emitter.on('a', (v) => expect(v).toBe(1)); } });",
    "it('x', () => { const setup = () => emitter.on('a', (v) => expect(v).toBe(1)); setup(); emitter.emit('a'); });",
    "it('x', () => { items.forEach((item) => { em.on(item, (v) => expect(v).toBe(1)); }); em.emit('a'); });",
    "it('x', () => { vi.useFakeTimers(); act(() => { setTimeout(() => expect(a).toBe(1), 10); }); vi.advanceTimersByTime(10); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); act(() => { jest.advanceTimersByTime(10); }); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); act(() => vi.advanceTimersByTime(10)); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); withFake(() => { clock.tick(10); }); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); const { advanceTimersByTime } = vi; advanceTimersByTime(10); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); const { runAllTimers: flush } = jest; flush(); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); jasmine.clock().tick(10); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); cy.tick(10); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); return sleep(20); });",
    "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); return new Promise((r) => setTimeout(r, 20)); });",
    "it('x', () => { queueMicrotask(() => expect(a).toBe(1)); return Promise.resolve(); });",
    "it('x', async () => { setTimeout(() => expect(a).toBe(1), 10); await using lock = acquire(); });",
    "it('x', () => { const sync = () => { setTimeout(() => expect(a).toBe(1)); }; sync(); return sleep(5); });",
  ],
  invalid: [
    [
      "it('x', async () => { await test.step('s', async () => { setTimeout(() => expect(a).toBe(1), 10); }); });",
      'timer',
      'setTimeout',
    ],
    ["it('x', () => { if (c) { em.on('a', (v) => expect(v).toBe(1)); } });", 'listener', 'on'],
    [
      "it('x', () => { const setup = () => emitter.on('a', (v) => expect(v).toBe(1)); setup(); });",
      'listener',
      'on',
    ],
    [
      "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); items.map((item) => { return item + 1; }); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); const wait = () => { vi.advanceTimersByTime(10); }; });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); setTimeout(() => { vi.advanceTimersByTime(10); }, 5); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); cy.get('li').next(); });",
      'timer',
      'setTimeout',
    ],
  ],
});
