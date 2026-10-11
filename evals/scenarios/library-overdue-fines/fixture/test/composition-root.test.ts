import { describe, expect, it, vi } from 'vitest';
import { catalogMain, loansMain, memberLoansMain } from '../src/main/composition-root.js';

function capture(run: () => void): string {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  run();
  const text = write.mock.calls.map(([chunk]) => String(chunk)).join('');
  write.mockRestore();
  return text;
}

function lines(...rows: readonly string[]): string {
  return rows.map((row) => `${row}\n`).join('');
}

const asOf = '2026-03-31';

const memberListings: readonly (readonly [string, string])[] = [
  [
    'M1',
    lines(
      'Loans for Ada Lovelace',
      'Dune: borrowed 2026-03-10, due 2026-03-24, 7d late',
      'The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late',
      'B99: borrowed 2026-02-15, due 2026-03-01, 30d late',
    ),
  ],
  [
    'M2',
    lines(
      'Loans for Grace Hopper',
      'World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late',
      'Dune: borrowed 2026-03-12, due 2026-03-26, 5d late',
    ),
  ],
  ['M3', lines('Loans for Brian Kernighan', 'Dune: borrowed 2026-02-20, due 2026-03-06, 25d late')],
  [
    'M4',
    lines(
      'Loans for Alan Turing',
      'Nature Monthly: borrowed 2026-03-07, returned 2026-03-23',
      'Dune: borrowed 2026-03-01, due 2026-03-15, 16d late',
    ),
  ],
  [
    'M5',
    lines(
      'Loans for Edsger Dijkstra',
      'The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late',
      'Dune: borrowed 2026-03-17, due 2026-03-31',
      'World Atlas: borrowed 2026-03-06, returned 2026-03-20',
    ),
  ],
  [
    'M6',
    lines(
      'Loans for Barbara Liskov',
      'World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late',
      'The Gruffalo: borrowed 2026-03-24, due 2026-04-07',
    ),
  ],
];

describe('composition root', () => {
  it('lists the catalog', () => {
    expect(capture(catalogMain)).toBe(
      lines(
        'B1 Dune (novel, 25c/day)',
        'B2 World Atlas (reference, 100c/day)',
        'B3 The Gruffalo (children, 10c/day)',
        'B4 Nature Monthly (periodical, 50c/day)',
      ),
    );
  });

  it('lists every loan', () => {
    expect(
      capture(() => {
        loansMain(asOf);
      }),
    ).toBe(
      lines(
        'M1: Dune: borrowed 2026-03-10, due 2026-03-24, 7d late',
        'M1: The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late',
        'M2: World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late',
        'M2: Dune: borrowed 2026-03-12, due 2026-03-26, 5d late',
        'M3: Dune: borrowed 2026-02-20, due 2026-03-06, 25d late',
        'M4: Nature Monthly: borrowed 2026-03-07, returned 2026-03-23',
        'M4: Dune: borrowed 2026-03-01, due 2026-03-15, 16d late',
        'M5: The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late',
        'M5: Dune: borrowed 2026-03-17, due 2026-03-31',
        'M5: World Atlas: borrowed 2026-03-06, returned 2026-03-20',
        'M6: World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late',
        'M6: The Gruffalo: borrowed 2026-03-24, due 2026-04-07',
        'M1: B99: borrowed 2026-02-15, due 2026-03-01, 30d late',
        'M99: Dune: borrowed 2026-02-16, due 2026-03-02, 29d late',
      ),
    );
  });

  it.each(memberListings)('lists the loans of member %s', (memberId, expected) => {
    expect(
      capture(() => {
        memberLoansMain(memberId, asOf);
      }),
    ).toBe(expected);
  });

  it('rejects an unknown member', () => {
    expect(
      capture(() => {
        memberLoansMain('M42', asOf);
      }),
    ).toBe(lines('Unknown member M42'));
  });
});
