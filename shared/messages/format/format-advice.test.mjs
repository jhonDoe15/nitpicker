import { describe, expect, it } from 'vitest';
import { FIX_COMMAND, formatAdvice } from './format-advice.mjs';

describe('formatAdvice', () => {
  it('names nitpicker --fix where it formats the file', () => {
    expect(formatAdvice()).toBe(
      'Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand.',
    );
    expect(FIX_COMMAND).toBe('nitpicker --fix');
  });

  it('names the exact formatter command next to nitpicker --fix', () => {
    expect(formatAdvice('gofumpt -extra -w')).toBe(
      'Run `nitpicker --fix`, or format the file with `gofumpt -extra -w <file>`.',
    );
  });
});
