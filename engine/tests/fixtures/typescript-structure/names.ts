export const curried = (a: number) => (b: number, c: number) => (d: number) => {
  if (a) {
    return b;
  }
  return c + d;
};

export const wrapped = ((a: string) => ((b: string) => a + b) as (b: string) => string);

export default function () {
  [1, 2].map((value) => value * 2);
  if (Math.random() > 0.5) {
    [3].forEach(() => {
      [4].forEach(() => undefined);
    });
  }
  [5].filter(() => true);
  return `${[6].map(() => 1).length} and ${(() => 2)()}`;
}

function outer(this: Window, first: number, ...rest: number[]) {
  const inner = function named() {
    return () => first;
  };
  const table = {
    plain: () => rest,
    method() {
      return [() => 1, () => 2];
    },
    get value() {
      return 1;
    },
    set value(next: number) {
      void next;
    },
    'quoted key': function () {
      return 3;
    },
    [`computed${first}`]: () => 4,
    [first]() {
      return 5;
    },
    nested: { deep: () => 6 },
  };
  return (inner(), table, (() => 7)(), () => 8);
}

outer.extra = function () {
  return 1;
};

module.exports = () => 2;

export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number): string | number {
  switch (typeof value) {
    case 'string': {
      for (const character of value) {
        if (character === 'a') {
          continue;
        } else if (character === 'b') {
          break;
        } else {
          try {
            JSON.parse(character);
          } catch {
            while (false) {
              do {
                debugger;
              } while (false);
            }
          } finally {
            void 0;
          }
        }
      }
      return value;
    }
    default:
      return value;
  }
}

declare function ambient(value: string): void;

export const generic = async function* <T>(items: T[], { a, b = () => 1 }: { a: number; b?: () => number } = { a: 1 }) {
  'use strict';
  label: for (let index = 0, size = items.length; index < size; index += 1) {
    yield items[index];
    if (a > b()) break label;
  }
  class Local {
    field = 1;
    go() {
      return this.field;
    }
  }
  type Alias = Local;
  interface Shape {
    alias: Alias;
  }
  enum Flag {
    On,
  }
  var hoisted: Shape | Flag | undefined;
  return hoisted;
};
