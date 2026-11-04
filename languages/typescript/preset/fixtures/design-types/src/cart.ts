import type { Priced } from './priced';

export class Cart implements Priced {
  private items: string[] = [];
  private copy: string[] = [];
  private frozen: readonly string[] = [];
  readonly tags = new Map<string, number>();
  #secret = {};
  total = 0;

  add(item: string): void {
    this.items.push(item);
  }

  reset(): void {
    this.copy = [...this.copy];
  }

  price(): number {
    return this.total + this.frozen.length;
  }
}

export class Point {
  x = 0;
  y = 0;

  get norm(): number {
    return this.x + this.y;
  }

  toString(): string {
    return `${String(this.x)}`;
  }
}

class Hidden {
  run(): void {}
}

export const hidden = new Hidden();
