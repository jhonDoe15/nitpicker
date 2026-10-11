import { describe, expect, it } from 'vitest';
import {
  describeResult,
  greet,
  greetAll,
  totalLength,
} from '../src/main/features/greeting/domain/greet.js';
import { runGreeting } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    expect(greet('  Ada ')).toEqual({ kind: 'greeted', text: 'Hello, Ada!' });
  });

  it('greets every name', () => {
    expect(greetAll(['Ada', ''])).toEqual([greet('Ada'), { kind: 'empty-name' }]);
  });

  it('sums name lengths with reduce and an initial value', () => {
    expect(totalLength(['Ada', 'Bo'])).toBe(5);
    expect(totalLength([])).toBe(0);
  });

  it('reports an empty name', () => {
    expect(describeResult(greet('   '))).toBe('No name given');
  });

  it('writes one line per name', () => {
    /** @type {string[]} */
    const written = [];
    runGreeting(['Ada', ''], {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['Hello, Ada!\n', 'No name given\n']);
  });
});
