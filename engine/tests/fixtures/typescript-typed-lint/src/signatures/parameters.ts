interface State {
  items: string[];
}

interface Options {
  size?: number;
  length?: number;
}

export class Account {
  name = '';

  rename(name: string): void {
    this.name = name;
  }

  save(record: { id?: string }): void {
    record.id = 'x';
  }

  private fill(items: string[]): void {
    items.push('x');
  }
}

export function add(items: string[], item: string): void {
  items.push(item);
  items.pop();
}

export function put(table: Record<string, number>, key: string, counts: number[]): void {
  table[key] = 1;
  delete table.total;
  counts[0]++;
}

export function copied(items: string[], user: { name: string }): string[] {
  const copy = [...items];
  copy.push('x');
  user = { ...user };
  user.name = 'x';
  return copy;
}

export function renamed(account: Account, pattern: RegExp, error: Error): void {
  account.name = 'x';
  pattern.lastIndex = 0;
  error.message = 'x';
}

export function written(options: Options, nested: { retry: { count: number } }, o: { a: number }): void {
  options.length ??= 8;
  nested.retry.count = 3;
  (o as { a: number }).a = 1;
}

export function assigned(o: { size?: number }, inner: { box: { size?: number } }): void {
  Object.assign(o, { size: 1 });
  Object.assign(inner.box, { size: 1 });
}

export function aliased(options?: { size?: number }, list?: string[]): void {
  const o = options ?? {};
  o.size = 1;
  const next = list;
  next?.push('x');
}

export function generic<T extends { size?: number }>(options: T, partial: Partial<Options>): void {
  options.size = 1;
  partial.size = 2;
}

function collect(list: string[], item: string): void {
  list.push(item);
}

export function helped(items: string[]): void {
  collect(items, 'x');
}

export function shallow(input: { inner: { size?: number } }): void {
  const copy = { ...input };
  copy.inner.size = 1;
}

export function exempt(out: string[], state: State, cache: Map<string, number>): void {
  out.push('x');
  state.items.push('x');
  cache.set('a', 1);
}

export function reduced(items: string[]): Record<string, number> {
  return items.reduce((table: Record<string, number>, item) => {
    table[item] = 1;
    return table;
  }, {});
}

export function resolveConfig(config: { build?: object }): void {
  config.build ??= {};
}

export function defaulted(table: string[] = [], item = ''): string[] {
  table.push(item);
  return table;
}

export function rest(...items: string[][]): void {
  items.push([]);
}

export function grid(rows: string[][], bytes: Uint8Array, set: Set<string>): void {
  rows[0]!.push('x');
  bytes[0] = 1;
  set.add('x');
}
