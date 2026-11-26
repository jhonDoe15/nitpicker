declare class Query {
  exec(): void;
}

declare const queries: {
  update(x: number): Query;
  reset(x: number): void;
  clear(): Promise<void>;
  load(): Promise<number>;
  maybe(): Promise<void | undefined>;
  either(): number | void;
  quit(): never;
};
declare const loose: { update: any; clear: Promise<void> | Promise<number> };
declare const unions: {
  loadAll: (() => Promise<number>) | (() => Promise<void>);
  voids: (() => Promise<void>) | (() => undefined);
};

export class Store {
  private readonly items = new Map<string, number>();
  private readonly list: number[] = [];

  update(x: number) {
    queries.update(x);
  }

  reset(x: number) {
    queries.reset(x);
  }

  async clear() {
    await queries.clear();
  }

  load() {
    queries.load();
  }

  async maybe() {
    await queries.maybe();
  }

  either() {
    queries.either();
  }

  quit() {
    queries.quit();
  }

  push(x: number) {
    this.list.push(x);
  }

  set(k: string, v: number) {
    this.items.set(k, v);
  }

  onChange(x: number) {
    queries.update(x);
  }

  viaCall(x: number) {
    queries.update.call(queries, x);
  }

  tail(x: number): void {
    queries.update(x);
  }

  async loadAll() {
    await unions.loadAll();
  }

  voids() {
    unions.voids();
  }

  chained(x: number) {
    const y = x + 1;
    queries.update(y)!;
  }

  static clear() {
    loose.clear;
    queries.clear();
  }
}

export const holder = {
  update(x: number) {
    queries.update(x)
  },
  loose(x: number) {
    loose.update(x);
  },
};
