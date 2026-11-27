declare const a: { b: number; c: number; ready: boolean };
declare const element: { endArrowhead?: string };
declare let total: number;
declare let ready: boolean;
declare const flags: number;

export function slips(x: number, y: number, kind: string, row: { total: number }, size: number, count: number) {
  if (element.endArrowhead || element.endArrowhead) {
    return 1;
  }
  const same = a.b === y && y === a.b;
  if (!(x && y) || !x) {
    return 2;
  }
  if (x !== x) {
    return 3;
  }
  const none = row.total - row.total;
  const one = (size as number) / size;
  if (x < 3 && x > 5) {
    return 4;
  }
  if (kind === 'a' && kind === 'b') {
    return 5;
  }
  if (x > 5 && x > 3) {
    return 6;
  }
  if (x === 1 || x >= 1) {
    return 7;
  }
  if (x !== 1 || x !== 2) {
    return 8;
  }
  const nothing = count * 0;
  const erased = 0 & flags;
  total += total + count;
  total *= count * total;
  ready ||= ready || a.ready;
  const big = size * 0n;
  const sum = (x + y) * 0;
  const kinds = typeof x === typeof x;
  const decimal = x === 1 || x === 1.0;
  const ternary = !(x > 2 ? true : false) || !(x > 2);
  const strings = kind !== `a` && kind === "a";
  const nested = (x > 1 && y > 1) && (y > 1 as boolean);
  return [same, none, one, nothing, erased, big, sum, kinds, decimal, ternary, strings, nested];
}

export function clean(x: number, y: number, next: () => number) {
  const values = [next() === next(), Math.random() === Math.random(), x > 3 && x < 5, x === 1 || x === 2];
  const more = [x >= 5 && x <= 5, x > 1e308 && x < 1.7e308, 1 * 0, x - y, x * 2, x < 3 && next() && x > 5];
  return [values, more];
}
