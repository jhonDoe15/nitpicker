import { describe, expect, it, vi } from 'vitest';
import { shoutMain } from '../src/main/composition-root.js';
import { runShout } from '../src/main/features/shout/index.js';

describe('shout', () => {
  it('writes the greeting in upper case, one line per name', () => {
    const written: string[] = [];
    runShout(['Ada', ''], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['HELLO, ADA!\n', 'NO NAME GIVEN\n']);
  });

  it('is wired into the composition root', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    shoutMain(['Ada']);
    expect(write).toHaveBeenCalledWith('HELLO, ADA!\n');
    write.mockRestore();
  });
});
