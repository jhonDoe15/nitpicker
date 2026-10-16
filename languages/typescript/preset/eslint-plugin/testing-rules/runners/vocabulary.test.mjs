import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { rule as noIntervalPolling } from '../../rules/testing/lifecycle/no-interval-polling-in-tests.mjs';
import { rule as noFixedSleep } from '../../rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';
import { TEST_RUNNERS } from '../../../test-runner/runners.mjs';

const SLEEP = "it('a', async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });";
const INTERVAL = "it('a', () => { setInterval(check, 10); });";
const ABSENCE =
  "it('a', async () => { await expect(screen.findByRole('tooltip')).rejects.toThrow(); });";

function messagesFor(rules, code, runner) {
  const options = runner === undefined ? [] : [{ runner }];
  return new Linter()
    .verify(code, [
      {
        files: ['**/*.js'],
        plugins: { nitpicker: { rules } },
        languageOptions: { sourceType: 'module' },
        rules: Object.fromEntries(
          Object.keys(rules).map((name) => [`nitpicker/${name}`, ['error', ...options]]),
        ),
      },
    ])
    .map(({ message }) => message);
}

const sleepRules = { 'no-fixed-sleep': noFixedSleep };
const intervalRules = { 'no-interval-polling': noIntervalPolling };
const EXCEPTION =
  'If a real wait is unavoidable, add an exception for nitpicker/no-fixed-sleep-synchronization in nitpicker.config.json.';

const sleepMessage = (advice) =>
  `Fixed sleeps are non-deterministic; wait on a condition with ${advice}. ${EXCEPTION}`;
const absenceMessage = (advance) =>
  `Do not assert absence by letting a wait time out: \`.rejects\` passes only after the full timeout, so the test is slow and depends on the delay. Advance fake timers past the delay (\`${advance}\`) and assert absence at once, such as \`expect(screen.queryByRole('tooltip')).toBeNull()\`. ${EXCEPTION}`;
const intervalMessage = (advice) => `Prefer ${advice} over setInterval polling in tests.`;

const ADVICE = {
  vitest: 'vi.waitFor or expect.poll',
  jest: 'waitFor from Testing Library or jest.advanceTimersByTimeAsync',
  node: 'an awaited event or promise, or mock.timers.tick',
  mocha: 'an awaited event or promise, or a fake clock advanced with clock.tickAsync',
};
const POLL = { ...ADVICE, vitest: 'vi.waitFor / expect.poll' };
const ADVANCE = {
  vitest: 'vi.advanceTimersByTime',
  jest: 'jest.advanceTimersByTime',
  node: 'mock.timers.tick',
  mocha: 'clock.tick',
};

describe('rule messages name the API of the project runner', () => {
  it.each(TEST_RUNNERS)(
    'say the %s call for a fixed sleep, a poll and a timed-out wait',
    (runner) => {
      expect(messagesFor(sleepRules, SLEEP, runner)).toEqual([sleepMessage(ADVICE[runner])]);
      expect(messagesFor(intervalRules, INTERVAL, runner)).toEqual([intervalMessage(POLL[runner])]);
      expect(messagesFor(sleepRules, ABSENCE, runner)).toEqual([absenceMessage(ADVANCE[runner])]);
    },
  );

  it('speak Vitest when the project runner is not given', () => {
    expect(messagesFor(sleepRules, SLEEP)).toEqual([sleepMessage(ADVICE.vitest)]);
    expect(messagesFor(intervalRules, INTERVAL)).toEqual([intervalMessage(POLL.vitest)]);
  });

  it.each(['jest', 'node', 'mocha'])('keep the vi namespace out of the %s messages', (runner) => {
    const all = [
      ...messagesFor(sleepRules, `${SLEEP}\n${ABSENCE}`, runner),
      ...messagesFor(intervalRules, INTERVAL, runner),
    ].join('\n');

    expect(all).not.toMatch(/\bvi\./u);
  });

  it('accept the runner ids the detection produces and nothing else', () => {
    for (const runner of TEST_RUNNERS) {
      expect(() => messagesFor(sleepRules, SLEEP, runner)).not.toThrow();
    }
    expect(() => messagesFor(sleepRules, SLEEP, 'tap')).toThrow(/allowed values/u);
  });
});
