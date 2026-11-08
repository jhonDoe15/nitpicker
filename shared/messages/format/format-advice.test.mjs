import { describe, expect, it } from 'vitest';
import { FIX_COMMAND, formatAdvice } from './format-advice.mjs';

describe('formatAdvice', () => {
  it('names nitpicker --fix where it formats the file', () => {
    expect(formatAdvice()).toBe('Run `nitpicker --fix` to format the changed files.');
    expect(FIX_COMMAND).toBe('nitpicker --fix');
  });

  it('names the exact formatter command where nitpicker --fix does not apply', () => {
    expect(formatAdvice('gofumpt -extra -w')).toBe(
      'Run `gofumpt -extra -w <file>` to format the file.',
    );
  });
});
