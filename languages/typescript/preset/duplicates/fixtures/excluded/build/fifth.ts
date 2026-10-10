export function ignoredCopy(values: readonly number[]): readonly number[] {
  return values
    .filter((value) => value > 0)
    .map((value) => value * 2)
    .filter((value) => value < 100)
    .sort((left, right) => left - right)
    .map((value) => value + 1);
}
