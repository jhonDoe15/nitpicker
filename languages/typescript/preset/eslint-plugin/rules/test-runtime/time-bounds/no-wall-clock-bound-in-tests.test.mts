import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-wall-clock-bound-in-tests.mts';

const tester = typescriptRuleTester();

const flagged = (code: string) => ({ code, errors: [{ messageId: 'wallClockBound' as const }] });
const timed = (assertion: string) =>
  `it("is fast", () => { const start = Date.now(); run(); ${assertion} });`;
const timedPrecise = (assertion: string) =>
  `it("is fast", () => { const start = performance.now(); run(); ${assertion} });`;

tester.run('no-wall-clock-bound-in-tests', rule, {
  valid: [
    timed('expect(Date.now() - start).toBeLessThan(1000);'),
    timed('expect(Date.now() - start).toBeLessThan(5000);'),
    timed('expect(Date.now() - start).toBeGreaterThanOrEqual(100);'),
    timed('expect(Date.now() - start).not.toBeLessThan(100);'),
    timedPrecise('expect(Date.now() - start).toBeLessThan(100);'),
    timed('expect(performance.now() - start).toBeLessThan(100);'),
    timed('expect(Date.now() - deadline).toBeLessThan(100);'),
    timed('expect(Date.now() - 500).toBeLessThan(100);'),
    timed('expect(result.duration).toBeLessThan(100);'),
    timed('expect(end - start).toBeLessThan(100);'),
    timed('expect(Date.now() - start).toBe(true);'),
    `it("is fast", () => {
      vi.useFakeTimers();
      const start = Date.now();
      vi.advanceTimersByTime(50);
      expect(Date.now() - start).toBeLessThan(100);
    });`,
    `jest.useFakeTimers(); it("is fast", () => {
      const start = Date.now(); expect(Date.now() - start).toBeLessThan(100);
    });`,
    {
      code: timed('expect(Date.now() - start).toBeLessThan(100);'),
      filename: 'parse.bench.ts',
    },
    'const start = Date.now(); if (Date.now() - start < 100) { retry(); }',
    timed('expect(start - Date.now()).toBeLessThan(100);'),
    timed('const end = Date.now(); expect(start - end).toBeLessThan(100);'),
    timed(
      'vi.spyOn(Date, "now").mockReturnValue(5); expect(Date.now() - start).toBeLessThan(100);',
    ),
    timedPrecise(
      'vi.spyOn(performance, "now"); expect(performance.now() - start).toBeLessThan(100);',
    ),
    timed('Date.now = () => 5; expect(Date.now() - start).toBeLessThan(100);'),
    timed('const clock = FakeTimers.install(); expect(Date.now() - start).toBeLessThan(100);'),
  ],
  invalid: [
    flagged(timed('expect(Date.now() - start).toBeLessThan(500);')),
    flagged(timed('expect(Date.now() - start).toBeLessThanOrEqual(999);')),
    flagged(timedPrecise('expect(performance.now() - start).toBeLessThan(50);')),
    flagged(
      timedPrecise('const elapsed = performance.now() - start; expect(elapsed).toBeLessThan(200);'),
    ),
    flagged(
      timed('const end = Date.now(); const took = end - start; expect(took).toBeLessThan(100);'),
    ),
    flagged(timed('expect(Date.now() - start < 100).toBe(true);')),
    flagged(timed('expect(100 > Date.now() - start).toBeTruthy();')),
    flagged(timed('assert.ok(Date.now() - start < 100);')),
    flagged(timed('assert(Date.now() - start <= 250);')),
    flagged(timed('expect(Date.now() - start).to.be.below(100);')),
    flagged(timed('expect(Date.now() - start).to.be.at.most(100);')),
    flagged(timed('const LIMIT = 300; expect(Date.now() - start).toBeLessThan(LIMIT);')),
    flagged(
      `let start: number;
      beforeEach(() => { start = Date.now(); });
      it("is fast", () => { run(); expect(Date.now() - start).toBeLessThan(100); });`,
    ),
    flagged(
      `it("is fast", () => {
        const start = new Date().getTime(); run(); expect(new Date().getTime() - start).toBeLessThan(100);
      });`,
    ),
  ],
});
