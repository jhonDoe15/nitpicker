import { describe, expect, it } from 'vitest';
import { partialRunField, partialRunLines, partialRunOf } from './partial-run.mjs';

const analyzers = ['coverage', 'crap', 'eslint-lint', 'prettier-format'].map((name) => ({ name }));

describe('partial run marker', () => {
  it('names the analyzers that ran and the ones left out when --analyzer narrows the run', () => {
    const partialRun = partialRunOf(['crap'], analyzers, analyzers.slice(0, 2));

    expect(partialRun).toEqual({
      ran: ['coverage', 'crap'],
      skipped: ['eslint-lint', 'prettier-format'],
      message: 'Ran only: coverage, crap. Run nitpicker without --analyzer before you finish.',
    });
    expect(partialRunField(partialRun)).toEqual({ partialRun });
    expect(partialRunLines({ partialRun })).toEqual([partialRun.message]);
  });

  it('marks nothing when no --analyzer was given or every analyzer was named', () => {
    expect(partialRunOf([], analyzers, analyzers.slice(0, 1))).toBeUndefined();
    expect(
      partialRunOf(
        analyzers.map(({ name }) => name),
        analyzers,
        analyzers,
      ),
    ).toBeUndefined();
    expect(partialRunField(undefined)).toEqual({});
    expect(partialRunLines({})).toEqual([]);
  });
});
