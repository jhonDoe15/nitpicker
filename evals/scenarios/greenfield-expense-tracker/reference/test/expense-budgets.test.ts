import { describe, expect, it } from 'vitest';
import { createExpenseTracker } from '../src/main/composition-root.js';
import { createDisk, open, savedJson, csvOf, reportText } from './support/expense-harness.js';

describe('budgets', () => {
  it('persists budgets as JSON sorted by month then category', async () => {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    expect(await tracker.setBudget('2024-04', 'Rent', 100000)).toEqual({ kind: 'saved' });
    expect(await tracker.setBudget('2024-03', 'Food', 5000)).toEqual({ kind: 'saved' });
    expect(await tracker.setBudget('2024-03', 'Fun', 0)).toEqual({ kind: 'saved' });
    expect(await tracker.setBudget('2024-03', 'Food', 6000)).toEqual({ kind: 'saved' });
    expect(await tracker.setBudget('2024-03', '  Bills ', 7000)).toEqual({ kind: 'saved' });
    expect(savedJson(disk, 'data/budgets.json')).toEqual({
      budgets: [
        { month: '2024-03', category: 'Bills', limitCents: 7000 },
        { month: '2024-03', category: 'Food', limitCents: 6000 },
        { month: '2024-03', category: 'Fun', limitCents: 0 },
        { month: '2024-04', category: 'Rent', limitCents: 100000 },
      ],
    });
  });

  it('sorts by month before category', async () => {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    await tracker.setBudget('2024-04', 'Alpha', 100);
    await tracker.setBudget('2024-03', 'Zed', 200);
    expect(savedJson(disk, 'data/budgets.json')).toEqual({
      budgets: [
        { month: '2024-03', category: 'Zed', limitCents: 200 },
        { month: '2024-04', category: 'Alpha', limitCents: 100 },
      ],
    });
  });

  it('keeps the budget of the same category in other months', async () => {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    await tracker.setBudget('2024-03', 'Food', 100);
    await tracker.setBudget('2024-04', 'Food', 200);
    await tracker.setBudget('2024-03', 'Rent', 300);
    await tracker.setBudget('2024-04', 'Food', 250);
    expect(savedJson(disk, 'data/budgets.json')).toEqual({
      budgets: [
        { month: '2024-03', category: 'Food', limitCents: 100 },
        { month: '2024-03', category: 'Rent', limitCents: 300 },
        { month: '2024-04', category: 'Food', limitCents: 250 },
      ],
    });
  });

  it('sorts categories by plain character order', async () => {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    await tracker.setBudget('2024-03', 'apple', 100);
    await tracker.setBudget('2024-03', 'Zed', 200);
    expect(savedJson(disk, 'data/budgets.json')).toEqual({
      budgets: [
        { month: '2024-03', category: 'Zed', limitCents: 200 },
        { month: '2024-03', category: 'apple', limitCents: 100 },
      ],
    });
  });

  it('keeps budgets already on disk and writes them back sorted', async () => {
    const disk = createDisk({
      'data/budgets.json': JSON.stringify({
        budgets: [
          { month: '2024-04', category: 'Rent', limitCents: 100000 },
          { month: '2024-03', category: 'Food', limitCents: 5000 },
        ],
      }),
    });
    await open(createExpenseTracker, disk).setBudget('2024-03', 'Fun', 2000);
    expect(savedJson(disk, 'data/budgets.json')).toEqual({
      budgets: [
        { month: '2024-03', category: 'Food', limitCents: 5000 },
        { month: '2024-03', category: 'Fun', limitCents: 2000 },
        { month: '2024-04', category: 'Rent', limitCents: 100000 },
      ],
    });
  });

  it.each([
    [['2024-13', 'Food', 100], 'invalid-month'],
    [['2024-00', 'Food', 100], 'invalid-month'],
    [['2024-3', 'Food', 100], 'invalid-month'],
    [['24-03', 'Food', 100], 'invalid-month'],
    [['2024-03-01', 'Food', 100], 'invalid-month'],
    [['', 'Food', 100], 'invalid-month'],
    [['2024-03', '', 100], 'invalid-category'],
    [['2024-03', '   ', 100], 'invalid-category'],
    [['2024-03', 'Food', -1], 'invalid-amount'],
    [['2024-03', 'Food', 1.5], 'invalid-amount'],
    [['2024-03', 'Food', Number.NaN], 'invalid-amount'],
    [['2024-03', 'Food', Number.POSITIVE_INFINITY], 'invalid-amount'],
    [['2024-13', '', -1], 'invalid-month'],
    [['2024-03', '', -1], 'invalid-category'],
  ] as const)('rejects %j as %s without writing', async ([month, category, cents], kind) => {
    const disk = createDisk();
    expect(await open(createExpenseTracker, disk).setBudget(month, category, cents)).toEqual({
      kind,
    });
    expect(disk.writes).toEqual([]);
  });

  it('treats a new tracker over the same files as the same tracker', async () => {
    const disk = createDisk();
    const first = open(createExpenseTracker, disk);
    await first.importCsv(csvOf('2024-03-02,80.00,Food,shop'));
    await first.setBudget('2024-03', 'Food', 10000);
    const second = open(createExpenseTracker, disk);
    expect(await second.report('2024-03')).toBe(await first.report('2024-03'));
    expect(await second.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 80.00 (budget 100.00, 20.00 remaining)',
        '',
        'Total: 80.00',
        '',
        'Largest expenses:',
        '1. 2024-03-02 Food 80.00 - shop',
      ),
    );
    expect(await second.largest('2024-03')).toEqual(await first.largest('2024-03'));
  });

  it('uses budgets written by hand in the documented shape', async () => {
    const disk = createDisk({
      'data/budgets.json': '{"budgets":[{"month":"2024-03","category":"Food","limitCents":12345}]}',
    });
    expect(await open(createExpenseTracker, disk).report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 0.00 (budget 123.45, 123.45 remaining)',
        '',
        'Total: 0.00',
        '',
        'Largest expenses:',
        'None',
      ),
    );
  });

  it('rejects when the budgets file is not valid', async () => {
    for (const content of [
      'not json',
      '{"budgets":"x"}',
      '{"budgets":[{"month":"2024-03"}]}',
      '[]',
    ]) {
      const disk = createDisk({ 'data/budgets.json': content });
      const tracker = open(createExpenseTracker, disk);
      await expect(tracker.setBudget('2024-03', 'Food', 100)).rejects.toThrow();
      await expect(tracker.report('2024-03')).rejects.toThrow();
      expect(disk.files.get('data/budgets.json')).toBe(content);
    }
  });
});
