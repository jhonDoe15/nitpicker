import { describe, expect, it } from 'vitest';
import { chainOf, depthFirst, foldTree } from './traversal.mjs';

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

  it('folds a tree from the leaves up, handing each node the values of its children', () => {
    const tree = { value: 1, children: [{ value: 2, children: [{ value: 3 }] }, { value: 4 }] };
    const sum = foldTree(
      tree,
      (node) => node.children ?? [],
      (node, values) => values.reduce((total, value) => total + value, node.value),
    );
    expect(sum).toBe(10);
  });

  it('passes the depth so a fold can stop descending', () => {
    const tree = { value: 1, children: [{ value: 2, children: [{ value: 3 }] }] };
    const sum = foldTree(
      tree,
      (node, depth) => (depth < 1 ? (node.children ?? []) : []),
      (node, values) => values.reduce((total, value) => total + value, node.value),
    );
    expect(sum).toBe(3);
  });
});
