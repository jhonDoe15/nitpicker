import { describe, expect, it } from 'vitest';
import { quickLines, quickSummary } from './summary.mjs';

describe('quick summary', () => {
  it('lists the skipped checks and tells the reader to run the full gate', () => {
    expect(quickSummary(['coverage', 'mutation'])).toEqual({
      skipped: ['coverage', 'mutation'],
      message:
        'Quick run: skipped coverage, mutation. Run nitpicker without --quick before you finish.',
    });
  });

  it('prints one line for a quick run and nothing for a full run', () => {
    expect(quickLines({ quick: quickSummary(['crap']) })).toEqual([
      'Quick run: skipped crap. Run nitpicker without --quick before you finish.',
    ]);
    expect(quickLines({})).toEqual([]);
    expect(quickLines(undefined)).toEqual([]);
  });
});
