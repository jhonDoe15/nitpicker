import { describe, expect, it } from '@jest/globals';
import { greet, totalLength } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    expect(greet('  Ada ')).toEqual({ kind: 'greeted', text: 'Hello, Ada!' });
  });

  it('reports an empty name', () => {
    expect(greet('   ')).toEqual({ kind: 'empty-name' });
  });

  it('sums name lengths with reduce and an initial value', () => {
    expect(totalLength(['Ada', 'Bo'])).toBe(5);
    expect(totalLength([])).toBe(0);
  });
});
