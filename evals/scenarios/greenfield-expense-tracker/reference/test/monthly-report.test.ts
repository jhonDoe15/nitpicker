import { describe, expect, it } from 'vitest';
import { createExpenseTracker } from '../src/main/composition-root.js';
import { createDisk, csvOf, open, reportText, savedJson } from './support/tracker-harness.js';

describe('monthly report', () => {
  async function marchTracker() {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    await tracker.importCsv(
      csvOf(
        '2024-03-01,1200.00,Rent,March rent',
        '2024-03-05,45.50,Food,Groceries',
        '2024-03-12,30.25,Food,',
        '2024-03-18,12.00,Fun,Cinema',
        '2024-03-19,3.05,Transport,Bus',
        '2024-02-28,99.99,Food,Last month',
        '2024-01-15,500.00,Rent,January',
      ),
    );
    await tracker.setBudget('2024-03', 'Rent', 100000);
    await tracker.setBudget('2024-03', 'Food', 10000);
    await tracker.setBudget('2024-03', 'Travel', 30000);
    await tracker.setBudget('2024-04', 'Fun', 1000);
    return tracker;
  }

  it('reports a month that has a single expense and no budget', async () => {
    const tracker = await marchTracker();
    expect(await tracker.report('2024-02')).toBe(
      [
        'Expense report for 2024-02',
        '',
        'Food: 99.99 (no budget)',
        '',
        'Total: 99.99',
        '',
        'Largest expenses:',
        '1. 2024-02-28 Food 99.99 - Last month',
        '',
      ].join('\n'),
    );
  });

  it('formats the full March report exactly', async () => {
    const tracker = await marchTracker();
    expect(await tracker.report('2024-03')).toBe(
      [
        'Expense report for 2024-03',
        '',
        'Rent: 1200.00 (budget 1000.00, OVER BUDGET by 200.00)',
        'Food: 75.75 (budget 100.00, 24.25 remaining)',
        'Fun: 12.00 (no budget)',
        'Transport: 3.05 (no budget)',
        'Travel: 0.00 (budget 300.00, 300.00 remaining)',
        '',
        'Total: 1290.80',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Rent 1200.00 - March rent',
        '2. 2024-03-05 Food 45.50 - Groceries',
        '3. 2024-03-12 Food 30.25',
        '',
      ].join('\n'),
    );
  });

  it('uses the month of today() when no month is given', async () => {
    const tracker = await marchTracker();
    expect(await tracker.report()).toBe(await tracker.report('2024-03'));
    expect(await tracker.largest()).toEqual(await tracker.largest('2024-03'));
  });

  it('follows today() when it moves to another month', async () => {
    const disk = createDisk({}, '2024-03-20');
    const tracker = open(createExpenseTracker, disk);
    await tracker.importCsv(csvOf('2024-02-10,10.00,Food,x', '2024-03-10,20.00,Food,y'));
    expect(await tracker.report()).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 20.00 (no budget)',
        '',
        'Total: 20.00',
        '',
        'Largest expenses:',
        '1. 2024-03-10 Food 20.00 - y',
      ),
    );
    disk.clock.today = '2024-04-02';
    expect(await tracker.report()).toBe(await tracker.report('2024-04'));
    expect(await tracker.report()).toBe(
      reportText(
        'Expense report for 2024-04',
        '',
        'No expenses.',
        '',
        'Total: 0.00',
        '',
        'Largest expenses:',
        'None',
      ),
    );
    disk.clock.today = '2024-02-29';
    expect(await tracker.report()).toBe(
      reportText(
        'Expense report for 2024-02',
        '',
        'Food: 10.00 (no budget)',
        '',
        'Total: 10.00',
        '',
        'Largest expenses:',
        '1. 2024-02-10 Food 10.00 - x',
      ),
    );
  });

  it('reports an empty month', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    expect(await tracker.report('2024-05')).toBe(
      'Expense report for 2024-05\n\nNo expenses.\n\nTotal: 0.00\n\nLargest expenses:\nNone\n',
    );
  });

  it('lists budgeted categories of a month without expenses', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.setBudget('2024-05', 'Food', 2500);
    expect(await tracker.report('2024-05')).toBe(
      [
        'Expense report for 2024-05',
        '',
        'Food: 0.00 (budget 25.00, 25.00 remaining)',
        '',
        'Total: 0.00',
        '',
        'Largest expenses:',
        'None',
        '',
      ].join('\n'),
    );
  });

  it('is not over budget when spending equals the budget', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,50.00,Food,'));
    await tracker.setBudget('2024-03', 'Food', 5000);
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 50.00 (budget 50.00, 0.00 remaining)',
        '',
        'Total: 50.00',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Food 50.00',
      ),
    );
    await tracker.setBudget('2024-03', 'Food', 4999);
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 50.00 (budget 49.99, OVER BUDGET by 0.01)',
        '',
        'Total: 50.00',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Food 50.00',
      ),
    );
  });

  it('treats a zero budget as a budget', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,0.05,Food,'));
    await tracker.setBudget('2024-03', 'Food', 0);
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 0.05 (budget 0.00, OVER BUDGET by 0.05)',
        '',
        'Total: 0.05',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Food 0.05',
      ),
    );
  });

  it('orders categories by total spent, largest first', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(
      csvOf('2024-03-01,1.00,Low,', '2024-03-02,3.00,High,', '2024-03-03,2.00,Mid,'),
    );
    expect((await tracker.report('2024-03')).split('\n').slice(2, 5)).toEqual([
      'High: 3.00 (no budget)',
      'Mid: 2.00 (no budget)',
      'Low: 1.00 (no budget)',
    ]);
  });

  it('breaks equal totals by category in plain character order', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(
      csvOf('2024-03-01,10.00,apple,', '2024-03-02,10.00,Zed,', '2024-03-03,10.00,Mid,'),
    );
    const report = await tracker.report('2024-03');
    const lines = report.split('\n').slice(2, 5);
    expect(lines).toEqual([
      'Mid: 10.00 (no budget)',
      'Zed: 10.00 (no budget)',
      'apple: 10.00 (no budget)',
    ]);
  });

  it('keeps categories that differ in case apart', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,10.00,food,', '2024-03-02,5.00,Food,'));
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'food: 10.00 (no budget)',
        'Food: 5.00 (no budget)',
        '',
        'Total: 15.00',
        '',
        'Largest expenses:',
        '1. 2024-03-01 food 10.00',
        '2. 2024-03-02 Food 5.00',
      ),
    );
  });

  it('formats money without separators and with two digits', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(
      csvOf('2024-03-01,1234567.89,Big,', '2024-03-02,0.05,Small,', '2024-03-03,1,Exact,'),
    );
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Big: 1234567.89 (no budget)',
        'Exact: 1.00 (no budget)',
        'Small: 0.05 (no budget)',
        '',
        'Total: 1234568.94',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Big 1234567.89',
        '2. 2024-03-03 Exact 1.00',
        '3. 2024-03-02 Small 0.05',
      ),
    );
  });

  it('answers invalid months with a message', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    expect(await tracker.report('2024-3')).toBe('Invalid month: 2024-3\n');
    expect(await tracker.report('2024-13')).toBe('Invalid month: 2024-13\n');
    expect(await tracker.report('')).toBe('Invalid month: \n');
    expect(await tracker.report('2024-03-01')).toBe('Invalid month: 2024-03-01\n');
    expect(await tracker.report('x2024-03')).toBe('Invalid month: x2024-03\n');
    expect(await tracker.report('2024-03x')).toBe('Invalid month: 2024-03x\n');
  });

  it('does not write anything', async () => {
    const disk = createDisk();
    const tracker = open(createExpenseTracker, disk);
    await tracker.report('2024-03');
    await tracker.largest('2024-03');
    expect(disk.writes).toEqual([]);
  });
});

describe('largest expenses', () => {
  it('returns the three largest of the month, ties by earlier date then import order', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(
      csvOf(
        '2024-03-09,50.00,B,first',
        '2024-03-02,50.00,A,earlier',
        '2024-03-09,50.00,C,second',
        '2024-03-01,10.00,D,small',
        '2024-03-05,99.00,E,top',
        '2024-02-05,500.00,F,other month',
      ),
    );
    const largest = await tracker.largest('2024-03');
    expect(largest.map((expense) => expense.note)).toEqual(['top', 'earlier', 'first']);
    expect((await tracker.report('2024-03')).split('Largest expenses:\n')[1]).toBe(
      '1. 2024-03-05 E 99.00 - top\n2. 2024-03-02 A 50.00 - earlier\n3. 2024-03-09 B 50.00 - first\n',
    );
  });

  it('returns fewer than three when the month has fewer', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,', '2024-03-02,2.00,B,'));
    expect(await tracker.largest('2024-03')).toHaveLength(2);
    expect(await tracker.largest('2024-04')).toEqual([]);
  });

  it('omits the note separator when the note is empty', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,', '2024-03-02,2.00,B,two'));
    expect((await tracker.report('2024-03')).split('Largest expenses:\n')[1]).toBe(
      '1. 2024-03-02 B 2.00 - two\n2. 2024-03-01 A 1.00\n',
    );
  });

  it('returns an empty list for an invalid month', async () => {
    const tracker = open(createExpenseTracker, createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,'));
    expect(await tracker.largest('2024-3')).toEqual([]);
    expect(await tracker.largest('')).toEqual([]);
  });

  it('survives a round trip through the fake file system', async () => {
    const disk = createDisk();
    await open(createExpenseTracker, disk).importCsv(csvOf('2024-03-01,12.34,Food,"a, b"'));
    expect(await open(createExpenseTracker, disk).largest('2024-03')).toEqual([
      { date: '2024-03-01', amountCents: 1234, category: 'Food', note: 'a, b' },
    ]);
    expect(disk.files.has('data/expenses.json')).toBe(true);
    expect(savedJson(disk, 'data/expenses.json')).not.toBeNull();
  });
});

describe('unreadable budget files', () => {
  it('names the file and keeps the cause', async () => {
    const disk = createDisk({ 'data/budgets.json': 'not json' });
    const failure = open(createExpenseTracker, disk).report('2024-03');
    await expect(failure).rejects.toThrow('Cannot read data/budgets.json');
    await expect(failure).rejects.toHaveProperty('cause');
  });
});
