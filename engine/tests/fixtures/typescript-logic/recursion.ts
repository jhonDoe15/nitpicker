export function walk(node: { children: unknown[] }): number {
  return node.children.length + walk(node);
}

export const viaVariable = function inner(count: number): number {
  return count > 0 ? inner(count - 1) + viaVariable(0) : 0;
};

export function even(count: number): boolean {
  return count === 0 ? true : odd(count - 1);
}

function odd(count: number): boolean {
  return count === 0 ? false : even(count - 1);
}

export function outer(values: number[]): number[] {
  function nested(value: number): number {
    return value > 0 ? outer([value - 1])[0] ?? 0 : 0;
  }
  return values.map(nested);
}

export function deferred(): void {
  setTimeout(() => {
    deferred();
  }, 10);
}

export function iterating(tree: { kids: unknown[] }): unknown[] {
  return tree.kids.flatMap(() => iterating(tree));
}

export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number): string | number {
  return typeof value === 'string' ? overloaded(value.length) : value;
}

export const anonymous = [
  function (): void {
    anonymous[0]?.();
  },
];

export class Built {
  constructor(readonly depth: number) {
    if (depth > 0) {
      new Built(depth - 1);
    }
  }
}

export function retry(attempt: number): Promise<number> {
  return Promise.resolve(attempt).then((value) => (value > 3 ? value : retry(value + 1)));
}

export function caught() {
  try {} catch (e) { var e = () => e(); }
  var e = () => e();
  return e;
}
