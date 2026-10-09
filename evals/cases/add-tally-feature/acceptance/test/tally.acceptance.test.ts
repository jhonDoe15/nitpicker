import { describe, expect, it, vi } from 'vitest';
import { tallyMain } from '../src/main/composition-root.js';
import { runTally } from '../src/main/features/tally/index.js';

function lines(input: unknown): string[] {
  const written: string[] = [];
  runTally(input, {
    write: (text) => {
      written.push(text);
    },
  });
  return written;
}

describe('tally', () => {
  it('counts non-blank strings and ignores other items', () => {
    expect(lines(['Ada', '  ', 'Grace', 7, null, ''])).toEqual(['Counted 2\n']);
    expect(lines([])).toEqual(['Counted 0\n']);
  });

  it('rejects input that is not an array', () => {
    expect(lines('Ada')).toEqual(['Invalid input\n']);
    expect(lines({ length: 2 })).toEqual(['Invalid input\n']);
    expect(lines(undefined)).toEqual(['Invalid input\n']);
  });

  it('writes to standard output from the composition root', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    tallyMain(['Ada', 'Grace', 'Linus']);
    expect(write).toHaveBeenCalledWith('Counted 3\n');
    write.mockRestore();
  });
});
