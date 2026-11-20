import {
  appendAll as appendAllItems,
  largest as largestValue,
  sharedPrefixLength as sharedPrefixLengthOf,
  smallest as smallestValue,
} from './items.mjs';

export const appendAll: <T>(target: T[], items: Iterable<T>) => T[] = appendAllItems;
export const largest: (values: Iterable<number>) => number = largestValue;
export const sharedPrefixLength: <T>(left: readonly T[], right: readonly T[]) => number =
  sharedPrefixLengthOf;
export const smallest: (values: Iterable<number>) => number = smallestValue;

export function reachableFrom<T>(start: Iterable<T>, next: (item: T) => Iterable<T>): Set<T> {
  const seen = new Set(start);
  for (const item of seen) {
    for (const reached of next(item)) {
      seen.add(reached);
    }
  }
  return seen;
}
