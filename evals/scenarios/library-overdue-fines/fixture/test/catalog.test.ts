import { describe, expect, it } from 'vitest';
import {
  createInMemoryCatalog,
  dailyFineRateCents,
  describeBook,
} from '../src/main/features/catalog/index.js';
import type { Book, Category } from '../src/main/features/catalog/index.js';

const book = (category: Category): Book => ({ id: 'B1', title: 'Dune', category });

describe('catalog', () => {
  it('prices every category in whole cents', () => {
    expect(dailyFineRateCents(book('novel'))).toBe(25);
    expect(dailyFineRateCents(book('reference'))).toBe(100);
    expect(dailyFineRateCents(book('children'))).toBe(10);
    expect(dailyFineRateCents(book('periodical'))).toBe(50);
  });

  it('describes a book with its rate', () => {
    expect(describeBook(book('novel'))).toBe('B1 Dune (novel, 25c/day)');
  });

  it('finds books by id', () => {
    const catalog = createInMemoryCatalog([book('novel')]);
    expect(catalog.find('B1')).toEqual(book('novel'));
    expect(catalog.find('B2')).toBeUndefined();
    expect(catalog.all()).toEqual([book('novel')]);
  });
});
