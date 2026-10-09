import { describe, expect, it, vi } from 'vitest';
import { tallyMain } from '../src/main/composition-root.js';
import { runTally } from '../src/main/features/tally/index.js';

vi.mock('../src/main/features/tally/index.js', () => ({ runTally: vi.fn() }));

describe('tally', () => {
  it('is wired into the composition root', () => {
    tallyMain(['Ada']);
    expect(runTally).toHaveBeenCalledTimes(1);
  });
});
