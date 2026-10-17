export function classify(value) {
  if (value > 10) return 'big';
  if (value > 5) return 'medium';
  return value > 0 ? 'small' : 'none';
}

export class Box {
  constructor(items) {
    this.items = items ?? [];
  }

  first() {
    return this.items[0];
  }

  static of(...items) {
    return new Box(items);
  }
}

export const compose =
  (...fns) =>
  (input) =>
    fns.reduce((acc, fn) => fn(acc), input);

export async function* generate(limit) {
  for (let index = 0; index < limit; index += 1) {
    yield index;
  }
}
