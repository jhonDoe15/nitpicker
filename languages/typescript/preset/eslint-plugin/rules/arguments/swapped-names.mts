const SUFFIX = /(?:_[a-z]|\d+)$/u;
const SINGLE_LETTER = /^[a-z]$/u;
const PAIRS: readonly (readonly [string, string])[] = [
  ['left', 'right'],
  ['lhs', 'rhs'],
];

function plainName(name: string): string {
  return name.replace(/^_+/u, '').toLowerCase();
}

function stemOf(name: string): string {
  return plainName(name).replace(SUFFIX, '');
}

function interchangeable(first: string, second: string): boolean {
  const one = plainName(first);
  const two = plainName(second);
  if (SINGLE_LETTER.test(one) && SINGLE_LETTER.test(two)) {
    return true;
  }
  if (
    PAIRS.some(
      ([left, right]) => (one === left && two === right) || (one === right && two === left),
    )
  ) {
    return true;
  }
  const stem = stemOf(first);
  return stem !== '' && stem === stemOf(second);
}

export type Swap = { readonly index: number; readonly other: number };

type SwapCall = {
  readonly parameters: readonly string[];
  readonly names: readonly string[];
  readonly given: readonly (string | undefined)[];
  readonly count: number;
  readonly recursive: boolean;
};

function swapAt(call: SwapCall, index: number): Swap | undefined {
  const { parameters, names, given, count, recursive } = call;
  const name = given[index];
  const other = name === undefined ? -1 : names.indexOf(plainName(name));
  const slot = given[other];
  if (other < 0 || other === index || other >= count || slot === undefined) {
    return undefined;
  }
  const exchange = plainName(slot) === names[index];
  const moved = other < index && !names.includes(plainName(slot)) && !recursive;
  const swapped =
    plainName(slot) !== names[other] &&
    (exchange || moved) &&
    !interchangeable(parameters[index] ?? '', parameters[other] ?? '');
  return swapped ? { index, other } : undefined;
}

export function findSwaps(
  parameters: readonly string[],
  given: readonly (string | undefined)[],
  recursive: boolean,
): Swap[] {
  const count = Math.min(parameters.length, given.length);
  const names = parameters.map(plainName);
  if (new Set(names.slice(0, count)).size !== count) {
    return [];
  }
  const call = { parameters, names, given, count, recursive };
  const swaps: Swap[] = [];
  for (const index of names.slice(0, count).keys()) {
    const swap = swapAt(call, index);
    if (
      swap !== undefined &&
      !swaps.some((found) => found.index === swap.other && found.other === swap.index)
    ) {
      swaps.push(swap);
    }
  }
  return swaps;
}
