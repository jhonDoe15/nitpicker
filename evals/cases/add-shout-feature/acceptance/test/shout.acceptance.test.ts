import { describe, expect, it, vi } from 'vitest';
import { shoutMain } from '../src/main/composition-root.js';
import { runShout } from '../src/main/features/shout/index.js';

describe('shout', () => {
  it('upper-cases the greeting for every name', () => {
    const written: string[] = [];
    runShout(['Ada', '  ', ' grace '], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['HELLO, ADA!\n', 'NO NAME GIVEN\n', 'HELLO, GRACE!\n']);
  });

  it('writes nothing for no names', () => {
    const written: string[] = [];
    runShout([], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual([]);
  });

  it('writes to standard output from the composition root', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    shoutMain(['Linus']);
    expect(write).toHaveBeenCalledWith('HELLO, LINUS!\n');
    write.mockRestore();
  });
});
