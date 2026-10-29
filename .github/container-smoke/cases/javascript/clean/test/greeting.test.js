import { describe, expect, it } from 'vitest';
import { describeResult, greet } from '../src/main/features/greeting/domain/greet.js';
import { initials } from '../src/main/features/greeting/domain/initials.cjs';
import { runGreeting } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    expect(greet('  Ada ')).toEqual({ kind: 'greeted', text: 'Hi, Ada!' });
  });

  it('takes the initial with a CommonJS domain module', () => {
    expect(initials('ada')).toBe('A');
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
    expect(written).toEqual(['A Hi, Ada!\n', '  No name given\n']);
  });
});
