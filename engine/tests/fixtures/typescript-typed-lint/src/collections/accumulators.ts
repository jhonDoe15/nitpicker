export function reduced(items: { id: number; tags: string[] }[]) {
  const ids = items.reduce((acc: number[], item) => acc.concat([item.id]), []);
  const tags = items.reduceRight(function (all: string[], item) {
    return all.concat(item.tags);
  }, []);
  const names = items.reduce((text, item) => text.concat(String(item.id)), '');
  const first = items.map((acc) => [acc.id].concat(1));
  return [ids, tags, names, first];
}

export function looped(groups: number[][], make: () => string[], parts: string[]) {
  let all: number[] = [];
  for (const group of groups) {
    all = all.concat(group);
  }
  let each: number[] = [];
  groups.forEach((group) => {
    each = each.concat(group);
  });
  let i = 0;
  let tuple: [number] = [1];
  while (i < groups.length) {
    tuple = tuple.concat(groups[i]) as [number];
    i += 1;
  }
  let text = '';
  for (const part of parts) {
    text = text.concat(part);
  }
  let made = make();
  for (const part of parts) {
    made = made.concat(part);
  }
  let mixed: string | string[] = '';
  for (const part of parts) {
    mixed = mixed.concat(part);
  }
  let maybe: string[] | undefined = [];
  for (const part of parts) {
    maybe = maybe?.concat(part);
  }
  const lookup = new Map<string, string[]>();
  for (const part of parts) {
    let row: string[] = [];
    row = row.concat(part);
    lookup.set(part, row);
  }
  let loose: any = [];
  for (const part of parts) {
    loose = loose.concat(part);
  }
  return [all, each, tuple, text, made, mixed, maybe, lookup, loose];
}

export function parameter(groups: string[][], seed: string[]) {
  for (const group of groups) {
    seed = seed.concat(group);
  }
  const set = new Set([1]);
  const total = Array.from(groups, (group) => {
    seed = seed.concat(group);
    return set.size;
  });
  return [seed, total];
}

export function shapes(groups: number[][], names: string[]) {
  let a: number[] = [];
  for (let i = 0; i < groups.length; a = a.concat(groups[i]), i++) {
    a = a.concat(groups[i]);
  }
  let b: number[] = [];
  for (const key in groups) {
    b = b.concat(groups[key]);
  }
  let c: number[] = [];
  do {
    c = c.concat(groups[0]);
  } while (c.length < 3);
  let d: number[] = [];
  const e = names.map((name) => {
    d = d.concat([name.length]);
    return groups.reduce((acc: number[], group) => {
      const inner = names.map(() => acc.concat(group));
      return acc.concat(inner.length, group);
    }, []);
  });
  let f: readonly number[] = [];
  for (const group of groups) {
    f = f.concat(group);
  }
  const g = groups.reduce((acc, group) => acc.concat(group), [] as number[]);
  const h = groups.reduce((acc, group) => acc?.concat(group), [] as number[]);
  const j = groups.reduce((acc, group) => (acc as number[]).concat(group), [] as number[]);
  return [a, b, c, d, e, f, g, h, j];
}

declare const Lists: { new (): unknown; reduce: new (reducer: (acc: number[], item: number) => number[], start: number[]) => unknown };
export const built = new Lists.reduce((acc: number[], item: number) => acc.concat([item]), []);
