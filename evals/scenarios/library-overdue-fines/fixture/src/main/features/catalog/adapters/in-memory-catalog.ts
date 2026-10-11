import type { Book } from '../domain/book.js';

export type Catalog = {
  readonly find: (id: string) => Book | undefined;
  readonly all: () => readonly Book[];
};

export function createInMemoryCatalog(books: readonly Book[]): Catalog {
  function find(id: string): Book | undefined {
    return books.find((book) => book.id === id);
  }

  function all(): readonly Book[] {
    return books;
  }

  return { find, all };
}
