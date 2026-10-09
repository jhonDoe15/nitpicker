import { describe, expect, it, vi } from 'vitest';
import { farewellMain } from '../src/main/composition-root.js';
import { describeFarewell, farewell } from '../src/main/features/farewell/domain/farewell.js';
import { runFarewell } from '../src/main/features/farewell/index.js';

describe('farewell', () => {
  it('says goodbye to a trimmed name', () => {
    expect(farewell('  Ada ')).toEqual({ kind: 'farewell', text: 'Goodbye, Ada!' });
  });

  it('reports an empty name', () => {
    expect(describeFarewell(farewell('   '))).toBe('No name given');
  });

  it('writes one line per name', () => {
    const written: string[] = [];
    runFarewell(['Ada', ''], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['Goodbye, Ada!\n', 'No name given\n']);
  });

  it('wires the farewell to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    farewellMain(['Ada']);
    expect(write).toHaveBeenCalledWith('Goodbye, Ada!\n');
    write.mockRestore();
  });
});
