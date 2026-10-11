import { describe, expect, it, vi } from 'vitest';
import { tallyMain } from '../src/main/composition-root.js';
import { countNonBlank } from '../src/main/features/tally/domain/tally.js';
import { runTally } from '../src/main/features/tally/index.js';

function lines(input: unknown): string[] {
  const written: string[] = [];
  runTally(input, {
    write: (text: string) => {
      written.push(text);
    },
  });
  return written;
}

describe('tally', () => {
  it('counts the non-blank strings', () => {
    expect(countNonBlank(['Ada', ' ', 'Grace', ''])).toBe(2);
  });

  it('counts only the strings of an array', () => {
    expect(lines(['Ada', '', 3, null])).toEqual(['Counted 1\n']);
  });

  it('rejects input that is not an array', () => {
    expect(lines('Ada')).toEqual(['Invalid input\n']);
  });

  it('is wired into the composition root', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    tallyMain(['Ada']);
    expect(write).toHaveBeenCalledWith('Counted 1\n');
    write.mockRestore();
  });
});
