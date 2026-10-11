export type Category = 'novel' | 'reference' | 'children' | 'periodical';

export type Book = {
  readonly id: string;
  readonly title: string;
  readonly category: Category;
};

function rateForCategory(category: Category): number {
  switch (category) {
    case 'novel':
      return 25;
    case 'reference':
      return 100;
    case 'children':
      return 10;
    case 'periodical':
      return 50;
  }
}

export function dailyFineRateCents(book: Book): number {
  return rateForCategory(book.category);
}

export function describeBook(book: Book): string {
  return `${book.id} ${book.title} (${book.category}, ${String(dailyFineRateCents(book))}c/day)`;
}
