import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { formatShares, splitBill } from '../src/main/features/billing/index.js';

describe('splitBill', () => {
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

  it('gives one person the whole bill', () => {
    expect(splitBill(1234, ['Ann'])).toEqual({
      shares: [{ name: 'Ann', cents: 1234 }],
      totalCents: 1234,
    });
  });

  it('keeps the input order of the people', () => {
    const split = splitBill(1000, ['Zed', 'Amy']);
    expect(split.shares.map((share) => share.name)).toEqual(['Zed', 'Amy']);
  });

  it('splits a zero total into zero shares', () => {
    expect(splitBill(0, ['Ann', 'Ben'])).toEqual({
      shares: [
        { name: 'Ann', cents: 0 },
        { name: 'Ben', cents: 0 },
      ],
      totalCents: 0,
    });
  });

  it('trims names', () => {
    expect(splitBill(200, ['  Ann ', 'Ben\t']).shares.map((share) => share.name)).toEqual([
      'Ann',
      'Ben',
    ]);
  });

  it('cuts a name to 24 characters', () => {
    const long = 'A'.repeat(30);
    expect(splitBill(100, [long]).shares).toEqual([{ name: 'A'.repeat(24), cents: 100 }]);
  });

  it('allows twelve people and no more', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `P${String(index)}`);
    expect(splitBill(1200, twelve).shares).toHaveLength(12);
    expect(() => splitBill(1300, [...twelve, 'P12'])).toThrow('At most 12 people');
  });

  it('rejects a blank name', () => {
    expect(() => splitBill(100, ['Ann', '  '])).toThrow('Blank name at position 1');
  });

  it('rejects a missing name', () => {
    expect(() => splitBill(100, ['Ann', undefined])).toThrow('Missing name at position 1');
    expect(() => splitBill(100, [null])).toThrow('Missing name at position 0');
  });

  it('rejects a name with a comma', () => {
    expect(() => splitBill(100, ['Smith, Ann'])).toThrow(
      'Name must not contain a comma: Smith, Ann',
    );
  });

  it('rejects a total above one million dollars', () => {
    expect(splitBill(100000000, ['Ann']).totalCents).toBe(100000000);
    expect(() => splitBill(100000001, ['Ann'])).toThrow('Total is too large');
  });

  it('rejects a duplicate name, ignoring case and spaces', () => {
    expect(() => splitBill(100, ['Ann', ' ann'])).toThrow('Duplicate name ann');
  });

  it('rejects a total that is not a whole number of cents', () => {
    for (const total of [-1, 10.5, '100', Number.NaN]) {
      expect(() => splitBill(total, ['Ann'])).toThrow('Total must be a whole number of cents');
    }
  });

  it('rejects people that are not a list', () => {
    expect(() => splitBill(100, 'Ann')).toThrow('People must be a list');
  });
});

describe('formatShares', () => {
  it('writes one aligned line per share and a total', () => {
    const written: string[] = [];
    formatShares(splitBill(900, ['Ann', 'Cy']), {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['Ann  $4.50\n', 'Cy   $4.50\n', 'Total: $9.00\n']);
  });

  it('pads every name to the longest one', () => {
    const written: string[] = [];
    formatShares(splitBill(1500, ['Bartholomew', 'Al', 'Cy']), {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual([
      'Bartholomew  $5.00\n',
      'Al           $5.00\n',
      'Cy           $5.00\n',
      'Total: $15.00\n',
    ]);
  });
});

describe('main', () => {
  it('wires the split to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(600, ['Ann', 'Ben']);
    expect(write.mock.calls).toEqual([['Ann  $3.00\n'], ['Ben  $3.00\n'], ['Total: $6.00\n']]);
    write.mockRestore();
  });
});
