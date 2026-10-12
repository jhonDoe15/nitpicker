import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { formatShares, splitBill } from '../src/main/features/billing/index.js';

const trio = ['Ann', 'Ben', 'Cy'];

describe('splitBill remainder cents', () => {
  it.each([
    { totalCents: 1000, people: trio, cents: [334, 333, 333] },
    { totalCents: 2000, people: trio, cents: [667, 667, 666] },
    { totalCents: 1001, people: trio, cents: [334, 334, 333] },
    { totalCents: 10, people: ['A', 'B', 'C', 'D'], cents: [3, 3, 2, 2] },
    { totalCents: 2, people: trio, cents: [1, 1, 0] },
    { totalCents: 1, people: ['A', 'B'], cents: [1, 0] },
    { totalCents: 0, people: trio, cents: [0, 0, 0] },
    { totalCents: 900, people: trio, cents: [300, 300, 300] },
  ])('splits $totalCents cents among $people.length people', ({ totalCents, people, cents }) => {
    expect(splitBill(totalCents, people)).toEqual({
      shares: people.map((name, position) => ({ name, cents: cents[position] })),
      totalCents,
    });
  });
});

describe('splitBill without people', () => {
  it('returns a failure result instead of throwing', () => {
    expect(splitBill(1000, [])).toEqual({ shares: [], totalCents: 1000, failure: 'no-people' });
  });

  it('still checks the total first', () => {
    expect(() => splitBill(-5, [])).toThrow('Total must be a whole number of cents');
  });
});

describe('printing a split', () => {
  it('prints the remainder cents on the first shares', () => {
    const written: string[] = [];
    formatShares(splitBill(1000, trio), {
      write: (text) => {
        written.push(text);
      },
    });
    expect(written).toEqual(['Ann  $3.34\n', 'Ben  $3.33\n', 'Cy   $3.33\n', 'Total: $10.00\n']);
  });

  it('says there is nobody to split between', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(1000, []);
    expect(write.mock.calls).toEqual([['Nobody to split between\n']]);
    write.mockRestore();
  });
});
