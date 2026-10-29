import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { describeResult, greet } from '../src/main/features/greeting/domain/greet.js';
import { runGreeting } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    expect(greet('  Ada ')).toEqual({ kind: 'greeted', text: 'Hi, Ada!' });
  });

  it('reports an empty name', () => {
    expect(describeResult(greet('   '))).toBe('No name given');
  });

  it('writes one line per name', () => {
    const written: string[] = [];
    runGreeting(['Ada', ''], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['Hi, Ada!\n', 'No name given\n']);
  });

  it('wires the greeting to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(['Ada']);
    expect(write).toHaveBeenCalledWith('Hi, Ada!\n');
    write.mockRestore();
  });
});
