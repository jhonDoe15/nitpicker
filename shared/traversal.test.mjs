import { describe, expect, it } from 'vitest';
import { chainOf, depthFirst, foldTree, whileHolds } from './traversal.mjs';

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

  it('folds children before their parent and passes each child the context its parent gives it', () => {
    const tree = {
      name: 'root',
      children: [{ name: 'a', children: [{ name: 'b' }] }, { name: 'c' }],
    };
    const folded = foldTree(tree, 0, {
      expand: (node, depth) => (node.children ?? []).map((child) => [child, depth + 1]),
      combine: (node, depth, children) => `${node.name}${String(depth)}(${children.join(',')})`,
    });
    expect(folded).toBe('root0(a1(b2()),c1())');
  });

  it('folds a tree deeper than the JavaScript call stack', () => {
    const deep = Array.from({ length: 20_000 }).reduce((child) => ({ children: [child] }), {
      children: [],
    });
    const depth = foldTree(deep, undefined, {
      expand: (node) => node.children.map((child) => [child]),
      combine: (_node, _context, children) => 1 + (children[0] ?? 0),
    });
    expect(depth).toBe(20_001);
  });
});
