import { afterEach, describe, expect, it } from 'vitest';
import { createProjectScripts } from '../../../test-support/project-sources.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, dataOf } = createProjectScripts();
afterEach(cleanup);

const HEAD = 'from __future__ import annotations\n\nfrom dataclasses import dataclass, field\n\n';
const ITEM = `${HEAD}from typing import TYPE_CHECKING\n\nif TYPE_CHECKING:\n    from shop.orders import Order\n\n\n@dataclass(frozen=True)\nclass Item:\n    sku: str\n    order: Order | None\n`;
const ORDER = `${HEAD}from shop.items import Item\n\n\n@dataclass(frozen=True)\nclass Order:\n    id: str\n    items: tuple[Item, ...] = ()\n`;

function cycles(files) {
  return dataOf('generated-member-cycle', files);
}

describe.skipIf(!enabled)('generated-member-cycle', () => {
  it('reports the back reference of an order and its items once, across modules', () => {
    expect(cycles({ 'shop/orders.py': ORDER, 'shop/items.py': ITEM })).toEqual([
      ['Item.order', { cycle: 'Order.items -> Item.order -> Order' }],
    ]);
  });

  it('reports a node that holds its parent and its children, on the parent', () => {
    const node = `${HEAD}from typing import Optional\n\n\n@dataclass\nclass Node:\n    parent: Optional[Node]\n    children: list["Node"] = field(default_factory=list)\n`;

    expect(cycles({ 'shop/tree.py': node })).toEqual([
      ['Node.parent', { cycle: 'Node.children -> Node.parent -> Node' }],
    ]);
  });

  it('follows attrs classes and a cycle through three classes', () => {
    const graph = `from __future__ import annotations\n\nimport attrs\n\n\n@attrs.define\nclass Graph:\n    edges: list[Edge]\n\n\n@attrs.frozen\nclass Edge:\n    target: Vertex\n\n\n@attrs.define\nclass Vertex:\n    graph: Graph\n`;

    expect(cycles({ 'shop/graph.py': graph })).toEqual([
      ['Vertex.graph', { cycle: 'Graph.edges -> Edge.target -> Vertex.graph -> Graph' }],
    ]);
  });

  it.each([
    ['a tree of children', '@dataclass\nclass Node:\n    children: list[Node]\n'],
    ['a linked list', '@dataclass\nclass Node:\n    next: Node | None\n'],
    [
      'a back reference left out of the comparison',
      '@dataclass\nclass Node:\n    parent: Node | None = field(default=None, compare=False)\n    children: list[Node] = field(default_factory=list)\n',
    ],
    [
      'no generated eq',
      '@dataclass(eq=False)\nclass Node:\n    parent: Node | None\n    children: list[Node]\n',
    ],
    [
      'a class variable and a callable',
      'from typing import Callable, ClassVar\n\n\n@dataclass\nclass Node:\n    root: ClassVar[Node]\n    parent: Callable[[], Node]\n    children: list[Node]\n',
    ],
    ['a plain class', 'class Node:\n    parent: Node | None\n    children: list[Node]\n'],
    [
      'a hand-written __eq__',
      '@dataclass\nclass Node:\n    parent: Node | None\n    children: list[Node]\n\n    def __eq__(self, other):\n        return self is other\n',
    ],
    [
      'a class token',
      '@dataclass\nclass Node:\n    parent: Node | None\n    kinds: list[type[Node]]\n',
    ],
    [
      'attr.s annotations that are not attributes',
      'import attr\n\n\n@attr.s\nclass Node:\n    parent: Node | None\n    children: list[Node] = attr.ib(factory=list)\n',
    ],
  ])('allows %s', (_name, code) => {
    expect(cycles({ 'shop/tree.py': `${HEAD}\n${code}` })).toEqual([]);
  });

  it('follows the fields a dataclass inherits, and a frozen hash over a hand-written __eq__', () => {
    const tree = `${HEAD}\n@dataclass\nclass Base:\n    parent: Node | None\n\n\n@dataclass\nclass Node(Base):\n    children: list[Node] = field(default_factory=list)\n`;
    const frozen = `${HEAD}\n@dataclass(frozen=True)\nclass Node:\n    parent: Node | None\n    children: tuple[Node, ...]\n\n    def __eq__(self, other):\n        return self is other\n`;

    expect(cycles({ 'shop/tree.py': tree })).toEqual([
      ['Node.parent', { cycle: 'Node.children -> Node.parent -> Node' }],
    ]);
    expect(cycles({ 'shop/tree.py': frozen })).toEqual([
      ['Node.parent', { cycle: 'Node.children -> Node.parent -> Node' }],
    ]);
  });

  it('allows an attrs back reference with eq=False and leaves tests alone', () => {
    const graph = `from __future__ import annotations\n\nimport attrs\n\n\n@attrs.define\nclass Graph:\n    vertices: list[Vertex]\n\n\n@attrs.define\nclass Vertex:\n    graph: Graph = attrs.field(eq=False)\n`;

    expect(cycles({ 'shop/graph.py': graph })).toEqual([]);
    expect(cycles({ 'tests/test_orders.py': ORDER, 'tests/test_items.py': ITEM })).toEqual([]);
  });
});
