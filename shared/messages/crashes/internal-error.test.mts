import { describe, expect, it } from 'vitest';
import { INTERNAL_ERROR_REPORT, describeFailure, withInternalFrames } from './internal-error.mts';

function overflow(): RangeError {
  try {
    const values: number[] = [];
    values.push(...Array.from({ length: 1_000_000 }, () => 0));
  } catch (error) {
    if (error instanceof RangeError) {
      return error;
    }
  }
  throw new Error('the spread did not overflow the stack');
}

describe('internal error descriptions', () => {
  it('name where a bug in nitpicker happened, with paths inside the package', () => {
    const lines = describeFailure(overflow()).split('\n');

    expect(lines[0]).toBe('Maximum call stack size exceeded');
    expect(lines[1]).toMatch(
      /^ {2}at overflow \(shared\/messages\/crashes\/internal-error\.test\.mts:\d+:\d+\)$/u,
    );
    expect(lines.at(-1)).toBe(INTERNAL_ERROR_REPORT);
    expect(lines.length).toBeLessThanOrEqual(8);
  });

  it('keep an expected failure to its message and causes', () => {
    const error = new Error('No base could be determined', { cause: new Error('no upstream') });

    expect(describeFailure(error)).toBe('No base could be determined\n  caused by: no upstream');
    expect(withInternalFrames('stopped', 'stopped')).toBe('stopped');
  });

  it('add the frames of a type error to a given message', () => {
    const failure = new TypeError("Cannot read properties of undefined (reading 'x')");
    const text = withInternalFrames('Internal error in the java analyzer: x', failure);

    expect(text.split('\n')[0]).toBe('Internal error in the java analyzer: x');
    expect(text).toContain(INTERNAL_ERROR_REPORT);
  });

  it('leave a type error that nitpicker throws about bad input to its message', () => {
    const failure = new TypeError('NITPICKER_MAX_PARALLEL must be a positive integer');

    expect(describeFailure(failure)).toBe('NITPICKER_MAX_PARALLEL must be a positive integer');
  });
});
