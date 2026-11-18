import { describe, expect, it } from 'vitest';
import { runnerFlags } from './maven-errorprone.mts';

const NOW = 1_000_000;

describe('runnerFlags', () => {
  it('runs a worker per tool slot on the memory of two slots, until half a minute before the limit', () => {
    expect(runnerFlags(600_000, { slots: 4, now: NOW })).toEqual([
      '-Dnitpicker.errorprone.workers=4',
      '-XX:MaxRAMPercentage=37.5',
      '-Dnitpicker.errorprone.deadline=1570000',
    ]);
  });

  it.each([[0], [30_000], [Number.POSITIVE_INFINITY]])(
    'leaves the deadline out for a limit of %d ms',
    (timeoutMs) => {
      expect(runnerFlags(timeoutMs, { slots: 1, now: NOW })).toEqual([
        '-Dnitpicker.errorprone.workers=1',
        '-XX:MaxRAMPercentage=75.0',
      ]);
    },
  );
});
