import { describe, expect, it } from 'vitest';
import { runnerFlags } from './maven-errorprone.mts';

describe('runnerFlags', () => {
  it('runs a worker per tool slot on the memory of two slots', () => {
    expect(runnerFlags(4)).toEqual([
      '-Dnitpicker.errorprone.workers=4',
      '-XX:MaxRAMPercentage=37.5',
    ]);
    expect(runnerFlags(1)).toEqual([
      '-Dnitpicker.errorprone.workers=1',
      '-XX:MaxRAMPercentage=75.0',
    ]);
  });
});
