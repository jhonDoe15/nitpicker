type Item = { id: string };

class Base {
  __total(items: Item[]): number {
    return items.length;
  }
  sum(items: Item[]): number {
    return items.length;
  }
}

export class Child extends Base {
  __total(items: Item[]): number {
    return this.sum(items);
  }
}

export class Plain {
  sum(items: Item[]): number {
    return items.length;
  }
  __total(items: Item[]): number {
    return this.sum(items);
  }
}

export interface Merged {
  __size(items: Item[]): number;
}

export class Merged {
  sum(items: Item[]): number {
    return items.length;
  }
  __size(items: Item[]): number {
    return this.sum(items);
  }
}

export function patch(o: Partial<{ __count: number; plain: number }>, r: Readonly<{ __id: string }>): void {
  o.__count = 1;
  o.plain = 2;
  (r as { __id: string }).__id = 'x';
}

export function picked(o: Pick<{ __count: number; other: string }, '__count'>): void {
  o.__count = 3;
}
