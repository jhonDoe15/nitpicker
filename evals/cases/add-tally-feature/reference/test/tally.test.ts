import { describe, expect, it, vi } from 'vitest';
import { tallyMain } from '../src/main/composition-root.js';
import { tally } from '../src/main/features/tally/domain/tally.js';
import { runTally } from '../src/main/features/tally/index.js';

describe('tally', () => {
  it('counts the non-blank strings', () => {
    expect(tally(['Ada', ' ', 'Grace', 3])).toEqual({ kind: 'counted', count: 2 });
  });

  it('rejects input that is not an array', () => {
    expect(tally('Ada')).toEqual({ kind: 'invalid-input' });
  });

  it('writes one line for each outcome', () => {
    const written: string[] = [];
    const writer = {
      write: (text: string) => {
        written.push(text);
      },
    };
    runTally(['Ada', ''], writer);
    runTally(null, writer);
    expect(written).toEqual(['Counted 1\n', 'Invalid input\n']);
  });

  it('is wired into the composition root', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    tallyMain(['Ada']);
    expect(write).toHaveBeenCalledWith('Counted 1\n');
    write.mockRestore();
  });
});
