import { describe, expect, it } from 'vitest';
import { chainOf, depthFirst, whileHolds } from './traversal.mjs';

describe('iterative tree traversal', () => {
  it('visits children before the next sibling in their original order', () => {
    const leaf = { name: 'leaf' };
    const tree = {
      name: 'root',
      children: [{ name: 'first', children: [leaf] }, { name: 'last' }],
    };
    const visited = [...depthFirst(tree, (node) => node.children ?? [])];
    expect(visited.map((node) => node.name)).toEqual(['root', 'first', 'leaf', 'last']);
  });

  it('handles a parent chain deeper than the JavaScript call stack', () => {
    const values = Array.from({ length: 20_000 }, (_, index) => index);
    const root = values.reduceRight((parent, value) => ({ parent, value }), undefined);
    expect(chainOf(root, (node) => node.parent).map((node) => node.value)).toEqual(values);
  });

  it('does not ask for the successor of an absent root', () => {
    expect(
      chainOf(undefined, () => {
        throw new Error('unexpected successor');
      }),
    ).toEqual([]);
  });

  it('repeats over one value until its condition stops holding', () => {
    const counter = { count: 0 };
    for (const current of whileHolds(counter, ({ count }) => count < 3)) {
      current.count += 1;
    }
    expect(counter).toEqual({ count: 3 });
  });
});
