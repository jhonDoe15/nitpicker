import { describe, expect, it } from 'vitest';
import { stronglyConnected } from './strongly-connected.mjs';

describe('strongly connected components', () => {
  it('finds the groups of more than one node that reach each other', () => {
    expect(
      stronglyConnected(
        ['a', 'b', 'c', 'd'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
          { source: 'b', target: 'c' },
        ],
      ),
    ).toEqual([['a', 'b']]);
  });

  it('finds a three-node ring and leaves out edges to unknown nodes', () => {
    expect(
      stronglyConnected(
        ['c', 'b', 'a'],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'c', target: 'a' },
          { source: 'c', target: 'x' },
        ],
      ),
    ).toEqual([['a', 'b', 'c']]);
  });
});
