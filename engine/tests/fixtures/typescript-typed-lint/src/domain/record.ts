type Keys = Set<string> | Map<string, number>;

export function record(seen: Set<number>, when: Date, items: number[], keys: Keys): void {
  seen.add(1);
  when.setTime(0);
  when.setUTCHours(1);
  items.push(1);
  items.push.call(items, 2);
  const push = items.push;
  push.apply(items, [3]);
  seen['delete'](2);
  keys.delete('a');
  new Uint8Array(4).set([1]);
  new URLSearchParams().append('a', 'b');
  new Map<string, number>().clear();
  items.toSorted();
  when.getTime();
}

const name = 'add' as const;
export const added = (seen: Set<number>): Set<number> => seen[name](1);
export const shown = (text: string): string => text.concat('!');
