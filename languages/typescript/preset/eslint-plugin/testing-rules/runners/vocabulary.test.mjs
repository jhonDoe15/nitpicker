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

describe('rule messages name the API of the project runner', () => {
  it('say vi.waitFor or expect.poll for Vitest, and by default', () => {
    expect(messagesFor(sleepRules, SLEEP, 'vitest')[0]).toContain('vi.waitFor or expect.poll');
    expect(messagesFor(sleepRules, SLEEP)[0]).toContain('vi.waitFor or expect.poll');
    expect(messagesFor(intervalRules, INTERVAL)[0]).toBe(
      'Prefer vi.waitFor / expect.poll over setInterval polling in tests.',
    );
  });

  it.each([
    ['jest', 'waitFor from Testing Library or jest.advanceTimersByTimeAsync'],
    ['node', 'an awaited event or promise, or mock.timers.tick'],
    ['mocha', 'a fake clock advanced with clock.tickAsync'],
  ])('point a %s project at %s', (runner, advice) => {
    expect(messagesFor(sleepRules, SLEEP, runner)[0]).toContain(advice);
    expect(messagesFor(intervalRules, INTERVAL, runner)[0]).toContain(advice);
  });

  it('name the fake-timer call of the runner when asking for an immediate absence check', () => {
    expect(messagesFor(sleepRules, ABSENCE, 'jest')[0]).toContain('`jest.advanceTimersByTime`');
    expect(messagesFor(sleepRules, ABSENCE, 'node')[0]).toContain('`mock.timers.tick`');
    expect(messagesFor(sleepRules, ABSENCE, 'vitest')[0]).toContain('`vi.advanceTimersByTime`');
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
