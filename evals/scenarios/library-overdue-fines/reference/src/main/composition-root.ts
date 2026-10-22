import { createInMemoryCatalog, describeBook } from './features/catalog/index.js';
import type { Book } from './features/catalog/index.js';
import { overdueReportLines } from './features/fines/index.js';
import { createInMemoryLoans, describeLoan } from './features/loans/index.js';
import type { Loan } from './features/loans/index.js';
import { createInMemoryMembers } from './features/members/index.js';
import type { Member } from './features/members/index.js';
export { fineCents } from './features/fines/index.js';

const books: readonly Book[] = [
  { id: 'B1', title: 'Dune', category: 'novel' },
  { id: 'B2', title: 'World Atlas', category: 'reference' },
  { id: 'B3', title: 'The Gruffalo', category: 'children' },
  { id: 'B4', title: 'Nature Monthly', category: 'periodical' },
];

const members: readonly Member[] = [
  { id: 'M1', name: 'Ada Lovelace', tier: 'standard' },
  { id: 'M2', name: 'Grace Hopper', tier: 'student' },
  { id: 'M3', name: 'Brian Kernighan', tier: 'standard' },
  { id: 'M4', name: 'Alan Turing', tier: 'standard' },
  { id: 'M5', name: 'Edsger Dijkstra', tier: 'student' },
  { id: 'M6', name: 'Barbara Liskov', tier: 'standard' },
];

const loans: readonly Loan[] = [
  { bookId: 'B1', memberId: 'M1', borrowedOn: '2026-03-10', dueOn: '2026-03-24' },
  { bookId: 'B3', memberId: 'M1', borrowedOn: '2026-03-14', dueOn: '2026-03-28' },
  { bookId: 'B2', memberId: 'M2', borrowedOn: '2026-02-24', dueOn: '2026-03-10' },
  { bookId: 'B1', memberId: 'M2', borrowedOn: '2026-03-12', dueOn: '2026-03-26' },
  { bookId: 'B1', memberId: 'M3', borrowedOn: '2026-02-20', dueOn: '2026-03-06' },
  {
    bookId: 'B4',
    memberId: 'M4',
    borrowedOn: '2026-03-07',
    dueOn: '2026-03-21',
    returnedOn: '2026-03-23',
  },
  { bookId: 'B1', memberId: 'M4', borrowedOn: '2026-03-01', dueOn: '2026-03-15' },
  { bookId: 'B3', memberId: 'M5', borrowedOn: '2026-03-16', dueOn: '2026-03-30' },
  { bookId: 'B1', memberId: 'M5', borrowedOn: '2026-03-17', dueOn: '2026-03-31' },
  {
    bookId: 'B2',
    memberId: 'M5',
    borrowedOn: '2026-03-06',
    dueOn: '2026-03-20',
    returnedOn: '2026-03-20',
  },
  {
    bookId: 'B2',
    memberId: 'M6',
    borrowedOn: '2026-03-06',
    dueOn: '2026-03-20',
    returnedOn: '2026-04-05',
  },
  { bookId: 'B3', memberId: 'M6', borrowedOn: '2026-03-24', dueOn: '2026-04-07' },
  { bookId: 'B99', memberId: 'M1', borrowedOn: '2026-02-15', dueOn: '2026-03-01' },
  { bookId: 'B1', memberId: 'M99', borrowedOn: '2026-02-16', dueOn: '2026-03-02' },
];

const catalog = createInMemoryCatalog(books);
const directory = createInMemoryMembers(members);
const repository = createInMemoryLoans(loans);

function print(lines: readonly string[]): void {
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

function titleOf(bookId: string): string {
  return catalog.find(bookId)?.title ?? bookId;
}

export function catalogMain(): void {
  print(catalog.all().map((book) => describeBook(book)));
}

export function loansMain(asOf: string): void {
  print(
    repository
      .all()
      .map((loan) => `${loan.memberId}: ${describeLoan(titleOf(loan.bookId), loan, asOf)}`),
  );
}

export function memberLoansMain(memberId: string, asOf: string): void {
  const member = directory.find(memberId);
  if (member === undefined) {
    print([`Unknown member ${memberId}`]);
    return;
  }
  const lines = repository
    .forMember(memberId)
    .map((loan) => describeLoan(titleOf(loan.bookId), loan, asOf));
  print([`Loans for ${member.name}`, ...lines]);
}

export function overdueReportMain(asOf: string): void {
  print(overdueReportLines({ catalog, members: directory, loans: repository }, asOf));
}
