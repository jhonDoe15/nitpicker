import path from 'node:path';
import { appendAll } from './lists/lists.mts';

type Entries<Node, Context> = readonly (readonly [Node, Context])[];
type Pending<Node, Context> = {
  readonly node: Node;
  readonly context: Context;
  readonly entries?: Entries<Node, Context>;
};

export function drawnItems<Item>(draw: () => Item | undefined): IterableIterator<Item, undefined> {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      const item = draw();
      return item === undefined ? { done: true, value: undefined } : { done: false, value: item };
    },
  };
}

export function whileHolds<Value>(
  value: Value,
  holds: (value: Value) => boolean,
): IterableIterator<Value, undefined> {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return holds(value) ? { done: false, value } : { done: true, value: undefined };
    },
  };
}

export function* depthFirst<Node>(
  root: Node,
  children: (node: Node) => readonly Node[],
): Generator<Node, void, undefined> {
  const pending = [{ node: root }];
  for (const item of drawnItems(() => pending.pop())) {
    yield item.node;
    for (const child of children(item.node).toReversed()) {
      pending.push({ node: child });
    }
  }
}

function pushReversed<Node extends object>(pending: Node[], items: readonly Node[]): void {
  const [only] = items;
  if (items.length === 1 && only !== undefined) {
    pending.push(only);
    return;
  }
  for (const item of items.toReversed()) {
    pending.push(item);
  }
}

export function preOrder<Node extends object>(
  root: Node,
  children: (node: Node) => readonly Node[],
): Node[] {
  const nodes: Node[] = [];
  const pending = [root];
  for (const node of drawnItems(() => pending.pop())) {
    nodes.push(node);
    pushReversed(pending, children(node));
  }
  return nodes;
}

function expandItem<Node, Context>(
  item: Pending<Node, Context>,
  expand: (node: Node, context: Context) => Entries<Node, Context>,
  pending: Pending<Node, Context>[],
): void {
  const entries = expand(item.node, item.context);
  pending.push({ ...item, entries });
  for (const [node, context] of entries.toReversed()) {
    pending.push({ node, context });
  }
}

export function foldTree<Node, Context, Result>(
  root: Node,
  context: Context,
  {
    expand,
    combine,
  }: {
    readonly expand: (node: Node, context: Context) => Entries<Node, Context>;
    readonly combine: (node: Node, context: Context, childResults: Result[]) => Result;
  },
): Result {
  const pending: Pending<Node, Context>[] = [{ node: root, context }];
  const results: { readonly value: Result }[] = [];
  for (const item of drawnItems(() => pending.pop())) {
    if (item.entries === undefined) {
      expandItem(item, expand, pending);
    } else {
      const childResults = results.splice(results.length - item.entries.length);
      results.push({
        value: combine(
          item.node,
          item.context,
          childResults.map(({ value }) => value),
        ),
      });
    }
  }
  const [first] = results;
  if (first === undefined) {
    throw new Error('foldTree produced no result');
  }
  return first.value;
}

function truthy<Value>(value: Value | undefined): value is Value {
  return Boolean(value);
}

export function chainOf<Node>(
  start: Node | undefined,
  next: (node: Node) => Node | undefined,
): Node[] {
  const nodes = truthy(start) ? [start] : [];
  for (const node of nodes) {
    const following = next(node);
    if (truthy(following)) {
      nodes.push(following);
    }
  }
  return nodes;
}

export function parentDirectory(directory: string): string | undefined {
  const parent = path.dirname(directory);
  return parent === directory ? undefined : parent;
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

export function objectChildren(node: unknown): object[] {
  if (!isObject(node)) {
    return [];
  }
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]): unknown[] => (Array.isArray(value) ? value : [value]))
    .filter(isObject);
}

export function expandsFully<Node>(
  root: Node,
  children: (node: Node) => readonly Node[] | undefined,
): boolean {
  const pending = [root];
  for (const node of pending) {
    const next = children(node);
    if (next === undefined) {
      return false;
    }
    appendAll(pending, next);
  }
  return true;
}
