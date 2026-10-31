import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { formatShares, splitBill } from '../src/main/features/billing/index.js';

type Result = ReturnType<typeof splitBill>;

function written(split: Result): readonly string[] {
  const lines: string[] = [];
  formatShares(split, {
    write: (text) => {
      lines.push(text);
    },
  });
  return lines;
}

function expectedShares(totalCents: number, count: number): readonly number[] {
  return Array.from({ length: count }, (_, position) =>
    position < totalCents % count
      ? Math.floor(totalCents / count) + 1
      : Math.floor(totalCents / count),
  );
}

const names = ['Ann', 'Ben', 'Cy', 'Dee', 'Eli', 'Flo', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lou'];

describe('remainder cents', () => {
  it('gives the reported example 334, 333, 333 and a total of 1000', () => {
    expect(splitBill(1000, ['Ann', 'Ben', 'Cy'])).toEqual({
      shares: [
        { name: 'Ann', cents: 334 },
        { name: 'Ben', cents: 333 },
        { name: 'Cy', cents: 333 },
      ],
      totalCents: 1000,
    });
  });

  it('no longer over-assigns when the share rounds up', () => {
    expect(splitBill(2000, ['Ann', 'Ben', 'Cy'])).toEqual({
      shares: [
        { name: 'Ann', cents: 667 },
        { name: 'Ben', cents: 667 },
        { name: 'Cy', cents: 666 },
      ],
      totalCents: 2000,
    });
  });

  it('gives the extra cents to the first people in input order, not to the last', () => {
    expect(splitBill(10, ['Zed', 'Amy', 'Bob', 'Cal'])).toEqual({
      shares: [
        { name: 'Zed', cents: 3 },
        { name: 'Amy', cents: 3 },
        { name: 'Bob', cents: 2 },
        { name: 'Cal', cents: 2 },
      ],
      totalCents: 10,
    });
  });

  it.each([
    [0, 1],
    [0, 5],
    [1, 1],
    [1, 2],
    [1, 12],
    [2, 3],
    [5, 7],
    [6, 7],
    [7, 7],
    [8, 7],
    [100, 3],
    [101, 3],
    [102, 3],
    [999, 4],
    [1000, 12],
    [1001, 12],
    [1011, 12],
    [99999999, 11],
    [100000000, 12],
    [100000000, 7],
  ])('splits %i cents among %i people exactly', (totalCents, count) => {
    const split = splitBill(totalCents, names.slice(0, count));
    expect(split).toEqual({
      shares: names
        .slice(0, count)
        .map((name, position) => ({ name, cents: expectedShares(totalCents, count)[position] })),
      totalCents,
    });
  });

  it('applies the rule to trimmed and cut names in input order', () => {
    expect(splitBill(101, ['  Ann ', 'Ben\t', 'C'.repeat(30)])).toEqual({
      shares: [
        { name: 'Ann', cents: 34 },
        { name: 'Ben', cents: 34 },
        { name: 'C'.repeat(24), cents: 33 },
      ],
      totalCents: 101,
    });
  });

  it('prints the remainder on the first lines', () => {
    expect(written(splitBill(1000, ['Ann', 'Ben', 'Cy']))).toEqual([
      'Ann  $3.34\n',
      'Ben  $3.33\n',
      'Cy   $3.33\n',
      'Total: $10.00\n',
    ]);
    expect(written(splitBill(2000, ['Ann', 'Ben', 'Cy']))).toEqual([
      'Ann  $6.67\n',
      'Ben  $6.67\n',
      'Cy   $6.66\n',
      'Total: $20.00\n',
    ]);
  });

  it('writes the remainder through main', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(1000, ['Ann', 'Ben', 'Cy']);
    expect(write.mock.calls).toEqual([
      ['Ann  $3.34\n'],
      ['Ben  $3.33\n'],
      ['Cy   $3.33\n'],
      ['Total: $10.00\n'],
    ]);
    write.mockRestore();
  });
});

describe('no people', () => {
  it.each([0, 1, 1000, 100000000])('returns the failure result for %i cents', (totalCents) => {
    const result = splitBill(totalCents, []);
    expect(result).toEqual({ shares: [], totalCents, failure: 'no-people' });
    expect(Object.keys(result).toSorted()).toEqual(['failure', 'shares', 'totalCents']);
  });

  it('does not add a failure field to a successful split', () => {
    expect(Object.keys(splitBill(1000, ['Ann', 'Ben'])).toSorted()).toEqual([
      'shares',
      'totalCents',
    ]);
    expect('failure' in splitBill(0, ['Ann'])).toBe(false);
  });

  it('prints a single line for the failure result', () => {
    expect(written(splitBill(1000, []))).toEqual(['Nobody to split between\n']);
  });

  it('prints the same single line through main', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(1000, []);
    expect(write.mock.calls).toEqual([['Nobody to split between\n']]);
    write.mockRestore();
  });

  it('checks the total before looking at the people', () => {
    expect(() => splitBill(-1, [])).toThrow('Total must be a whole number of cents');
    expect(() => splitBill(10.5, [])).toThrow('Total must be a whole number of cents');
    expect(() => splitBill('100', [])).toThrow('Total must be a whole number of cents');
    expect(() => splitBill(Number.NaN, [])).toThrow('Total must be a whole number of cents');
    expect(() => splitBill(100000001, [])).toThrow('Total is too large');
  });

  it('checks that people is a list before counting them', () => {
    expect(() => splitBill(100, 'Ann')).toThrow('People must be a list');
    expect(() => splitBill(100, undefined)).toThrow('People must be a list');
  });
});

describe('behavior that stays as it was', () => {
  it('splits an even total equally', () => {
    expect(splitBill(900, ['Ann', 'Ben', 'Cy'])).toEqual({
      shares: [
        { name: 'Ann', cents: 300 },
        { name: 'Ben', cents: 300 },
        { name: 'Cy', cents: 300 },
      ],
      totalCents: 900,
    });
  });

  it('keeps every validation message and its order', () => {
    expect(() => splitBill(100, ['Ann', '  '])).toThrow('Blank name at position 1');
    expect(() => splitBill(100, ['Ann', undefined])).toThrow('Missing name at position 1');
    expect(() => splitBill(100, [null])).toThrow('Missing name at position 0');
    expect(() => splitBill(100, ['Smith, Ann'])).toThrow(
      'Name must not contain a comma: Smith, Ann',
    );
    expect(() => splitBill(100, ['Ann', ' ann'])).toThrow('Duplicate name ann');
    expect(() => splitBill(100, names.concat('Max'))).toThrow('At most 12 people');
    expect(() => splitBill(100000001, ['Ann'])).toThrow('Total is too large');
  });

  it('still rejects names that only collide after cutting', () => {
    expect(() => splitBill(100, ['A'.repeat(30), 'A'.repeat(25)])).toThrow(
      `Duplicate name ${'A'.repeat(24)}`,
    );
  });

  it('pads names to the longest one', () => {
    expect(written(splitBill(1500, ['Bartholomew', 'Al', 'Cy']))).toEqual([
      'Bartholomew  $5.00\n',
      'Al           $5.00\n',
      'Cy           $5.00\n',
      'Total: $15.00\n',
    ]);
  });

  it('prints a zero total as zero shares', () => {
    expect(written(splitBill(0, ['Ann', 'Ben']))).toEqual([
      'Ann  $0.00\n',
      'Ben  $0.00\n',
      'Total: $0.00\n',
    ]);
  });

  it('formats cents under ten with a leading zero', () => {
    expect(written(splitBill(205, ['Ann']))).toEqual(['Ann  $2.05\n', 'Total: $2.05\n']);
  });
});
