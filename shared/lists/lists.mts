import {
  appendAll as appendAllItems,
  largest as largestValue,
  smallest as smallestValue,
} from './items.mjs';

export const appendAll: <T>(target: T[], items: Iterable<T>) => T[] = appendAllItems;
export const largest: (values: Iterable<number>) => number = largestValue;
export const smallest: (values: Iterable<number>) => number = smallestValue;
