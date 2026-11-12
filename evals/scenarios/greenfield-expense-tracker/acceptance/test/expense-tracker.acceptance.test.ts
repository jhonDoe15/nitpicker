import { describe, expect, it } from 'vitest';
import { createExpenseTracker } from '../src/main/composition-root.js';

type FakeDisk = {
  readonly files: Map<string, string>;
  readonly writes: string[];
  readonly clock: { today: string };
};

function createDisk(initial: Record<string, string> = {}, today = '2024-03-20'): FakeDisk {
  return { files: new Map(Object.entries(initial)), writes: [], clock: { today } };
}

function open(disk: FakeDisk) {
  return createExpenseTracker({
    readText: (path: string) => Promise.resolve(disk.files.get(path)),
    writeText: (path: string, text: string) => {
      disk.writes.push(path);
      disk.files.set(path, text);
      return Promise.resolve();
    },
    today: () => disk.clock.today,
  });
}

function savedJson(disk: FakeDisk, path: string): unknown {
  const parsed: unknown = JSON.parse(disk.files.get(path) ?? 'null');
  return parsed;
}

const HEADER = 'date,amount,category,note';
const csvOf = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('importing CSV', () => {
  it('imports valid rows and stores amounts as integer cents', async () => {
    const tracker = open(createDisk());
    const result = await tracker.importCsv(
      csvOf('2024-03-05,12.34,Food,Lunch', '2024-03-06,7,Food,', '2024-03-07,0.5,Transport,Bus'),
    );
    expect(result).toEqual({ imported: 3, errors: [] });
    expect(await tracker.largest('2024-03')).toEqual([
      { date: '2024-03-05', amountCents: 1234, category: 'Food', note: 'Lunch' },
      { date: '2024-03-06', amountCents: 700, category: 'Food', note: '' },
      { date: '2024-03-07', amountCents: 50, category: 'Transport', note: 'Bus' },
    ]);
  });

  it('does not lose cents to floating point', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(
      csvOf(
        '2024-03-01,1.15,A,',
        '2024-03-02,0.29,B,',
        '2024-03-03,4.35,C,',
        '2024-03-04,8.2,D,',
        '2024-03-05,19.99,E,',
      ),
    );
    const largest = await tracker.largest('2024-03');
    expect(largest.map((expense) => expense.amountCents)).toEqual([1999, 820, 435]);
    const report = await tracker.report('2024-03');
    expect(report).toContain('A: 1.15 (no budget)');
    expect(report).toContain('B: 0.29 (no budget)');
    expect(report).toContain('Total: 33.98\n');
  });

  it('accepts one or two decimals and leading zeros', async () => {
    const tracker = open(createDisk());
    const result = await tracker.importCsv(
      csvOf('2024-03-01,12.3,A,', '2024-03-02,007,B,', '2024-03-03,0.05,C,'),
    );
    expect(result).toEqual({ imported: 3, errors: [] });
    expect((await tracker.largest('2024-03')).map((e) => e.amountCents)).toEqual([1230, 700, 5]);
  });

  it('parses quoted fields with commas, doubled quotes and padding', async () => {
    const tracker = open(createDisk());
    const result = await tracker.importCsv(
      csvOf(
        '2024-03-08,"1234.50","Dining, out","He said ""hi"", twice"',
        '"2024-03-09",5.00," Food ",""""',
        '2024-03-10,5.00,Misc,""',
      ),
    );
    expect(result).toEqual({ imported: 3, errors: [] });
    expect(await tracker.largest('2024-03')).toEqual([
      { date: '2024-03-08', amountCents: 123450, category: 'Dining, out', note: 'He said "hi", twice' },
      { date: '2024-03-09', amountCents: 500, category: 'Food', note: '"' },
      { date: '2024-03-10', amountCents: 500, category: 'Misc', note: '' },
    ]);
  });

  it('trims unquoted fields', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf(' 2024-03-10 , 5.00 , Food , a note '));
    expect(await tracker.largest('2024-03')).toEqual([
      { date: '2024-03-10', amountCents: 500, category: 'Food', note: 'a note' },
    ]);
  });

  it('accepts CRLF line endings and a trailing newline', async () => {
    const tracker = open(createDisk());
    const result = await tracker.importCsv(
      `${HEADER}\r\n2024-03-01,1.00,A,x\r\n2024-03-02,2.00,B,y\r\n`,
    );
    expect(result).toEqual({ imported: 2, errors: [] });
  });

  it('reports invalid lines with their line number and imports the valid ones', async () => {
    const disk = createDisk();
    const tracker = open(disk);
    const result = await tracker.importCsv(
      [
        HEADER,
        '2024-03-01,10.00,Food,ok',
        '',
        '2024-13-01,5.00,Food,bad month',
        '2024-03-10,abc,Food,bad amount',
        '   ',
        '2024-03-11,3.00,Food,ok too',
      ].join('\n'),
    );
    expect(result).toEqual({
      imported: 2,
      errors: [
        { line: 4, reason: 'Invalid date' },
        { line: 5, reason: 'Invalid amount' },
      ],
    });
    expect(await tracker.report('2024-03')).toContain('Total: 13.00\n');
  });

  it.each([
    ['2024-03-10,5.00,Food', 'Expected 4 fields, found 3'],
    ['2024-03-10,5.00,Food,a,b', 'Expected 4 fields, found 5'],
    [',,,', 'Invalid date'],
    ['2024-03-10,5.00,"Food,x', 'Unterminated quote'],
    ['2024-03-10,5.00,"Food', 'Unterminated quote'],
    ['2024-03-10,5.00,Fo"od,x', 'Malformed quoted field'],
    ['2024-03-10,5.00,"Food"x,y', 'Malformed quoted field'],
    ['2024-03-10,5.00, "Food",y', 'Malformed quoted field'],
    ['2023-02-29,5.00,Food,x', 'Invalid date'],
    ['2024-02-30,5.00,Food,x', 'Invalid date'],
    ['2024-3-1,5.00,Food,x', 'Invalid date'],
    ['2024-00-10,5.00,Food,x', 'Invalid date'],
    ['2024-04-31,5.00,Food,x', 'Invalid date'],
    ['2024-03-00,5.00,Food,x', 'Invalid date'],
    ['2024-03-32,5.00,Food,x', 'Invalid date'],
    ['2024-03-10x,5.00,Food,x', 'Invalid date'],
    ['x2024-03-10,5.00,Food,x', 'Invalid date'],
    ['12024-03-10,5.00,Food,x', 'Invalid date'],
    ['March 3,5.00,Food,x', 'Invalid date'],
    ['2024-03-16,5.00,Food,x', 'Date is in the future'],
    ['2025-01-01,5.00,Food,x', 'Date is in the future'],
    ['2024-03-10,12.345,Food,x', 'Invalid amount'],
    ['2024-03-10,-5.00,Food,x', 'Invalid amount'],
    ['2024-03-10,.5,Food,x', 'Invalid amount'],
    ['2024-03-10,5.,Food,x', 'Invalid amount'],
    ['2024-03-10,$5,Food,x', 'Invalid amount'],
    ['2024-03-10,1e3,Food,x', 'Invalid amount'],
    ['2024-03-10,"1,000.00",Food,x', 'Invalid amount'],
    ['2024-03-10,,Food,x', 'Invalid amount'],
    ['2024-03-10,0,Food,x', 'Amount must be positive'],
    ['2024-03-10,0.00,Food,x', 'Amount must be positive'],
    ['2024-03-10,5.00,   ,x', 'Empty category'],
    ['2024-03-10,5.00,"",x', 'Empty category'],
    ['2024-13-40,abc,,x', 'Invalid date'],
    ['2024-03-16,abc,Food,x', 'Date is in the future'],
    ['2024-03-10,0,,x', 'Amount must be positive'],
  ])('reports %j as %j', async (row, reason) => {
    const disk = createDisk({}, '2024-03-15');
    const result = await open(disk).importCsv(csvOf(row));
    expect(result).toEqual({ imported: 0, errors: [{ line: 2, reason }] });
    expect(disk.writes).toEqual([]);
  });

  it('skips a blank line without reporting it', async () => {
    const disk = createDisk();
    expect(await open(disk).importCsv(csvOf(''))).toEqual({ imported: 0, errors: [] });
    expect(disk.writes).toEqual([]);
  });

  it('accepts the last day of the year', async () => {
    const tracker = open(createDisk({}, '2024-12-31'));
    const result = await tracker.importCsv(csvOf('2024-12-31,5.00,Food,x', '2024-01-01,5.00,Food,y'));
    expect(result).toEqual({ imported: 2, errors: [] });
  });

  it('accepts a leap day and today itself', async () => {
    const tracker = open(createDisk({}, '2024-03-15'));
    const result = await tracker.importCsv(csvOf('2024-02-29,5.00,Food,x', '2024-03-15,5.00,Food,y'));
    expect(result).toEqual({ imported: 2, errors: [] });
  });

  it('rejects the whole import when the header is wrong or missing', async () => {
    const disk = createDisk();
    const tracker = open(disk);
    const invalid = { imported: 0, errors: [{ line: 1, reason: 'Invalid header' }] };
    expect(await tracker.importCsv('2024-03-01,5.00,Food,x')).toEqual(invalid);
    expect(await tracker.importCsv('date,amount,category\n2024-03-01,5.00,Food,x')).toEqual(invalid);
    expect(await tracker.importCsv('Date,Amount,Category,Note\n2024-03-01,5.00,Food,x')).toEqual(
      invalid,
    );
    expect(await tracker.importCsv('')).toEqual(invalid);
    expect(disk.writes).toEqual([]);
  });

  it('imports nothing from a header-only file', async () => {
    const disk = createDisk();
    expect(await open(disk).importCsv(HEADER)).toEqual({ imported: 0, errors: [] });
    expect(disk.writes).toEqual([]);
  });

  it('reads today() on every call, not once at creation', async () => {
    const disk = createDisk({}, '2024-03-10');
    const tracker = open(disk);
    expect(await tracker.importCsv(csvOf('2024-03-20,5.00,Food,x'))).toEqual({
      imported: 0,
      errors: [{ line: 2, reason: 'Date is in the future' }],
    });
    disk.clock.today = '2024-03-25';
    expect(await tracker.importCsv(csvOf('2024-03-20,5.00,Food,x'))).toEqual({
      imported: 1,
      errors: [],
    });
  });

  it('appends to expenses imported earlier', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,10.00,Food,a'));
    await tracker.importCsv(csvOf('2024-03-02,20.00,Food,b'));
    expect(await tracker.report('2024-03')).toContain('Food: 30.00 (no budget)');
  });
});

describe('budgets', () => {
  it('persists budgets as JSON sorted by month then category', async () => {
    const disk = createDisk();
    const tracker = open(disk);
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
    const tracker = open(disk);
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
    const tracker = open(disk);
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
    const tracker = open(disk);
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
    await open(disk).setBudget('2024-03', 'Fun', 2000);
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
    expect(await open(disk).setBudget(month, category, cents)).toEqual({ kind });
    expect(disk.writes).toEqual([]);
  });

  it('treats a new tracker over the same files as the same tracker', async () => {
    const disk = createDisk();
    const first = open(disk);
    await first.importCsv(csvOf('2024-03-02,80.00,Food,shop'));
    await first.setBudget('2024-03', 'Food', 10000);
    const second = open(disk);
    expect(await second.report('2024-03')).toBe(await first.report('2024-03'));
    expect(await second.report('2024-03')).toContain('Food: 80.00 (budget 100.00, 20.00 remaining)');
    expect(await second.largest('2024-03')).toEqual(await first.largest('2024-03'));
  });

  it('uses budgets written by hand in the documented shape', async () => {
    const disk = createDisk({
      'data/budgets.json': '{"budgets":[{"month":"2024-03","category":"Food","limitCents":12345}]}',
    });
    expect(await open(disk).report('2024-03')).toContain('Food: 0.00 (budget 123.45, 123.45 remaining)');
  });

  it('rejects when the budgets file is not valid', async () => {
    const rejectsContent = async (content: string) => {
      const disk = createDisk({ 'data/budgets.json': content });
      const tracker = open(disk);
      await expect(tracker.setBudget('2024-03', 'Food', 100)).rejects.toThrow();
      await expect(tracker.report('2024-03')).rejects.toThrow();
      expect(disk.files.get('data/budgets.json')).toBe(content);
    };
    await rejectsContent('not json');
    await rejectsContent('{"budgets":"x"}');
    await rejectsContent('{"budgets":[{"month":"2024-03"}]}');
    await rejectsContent('[]');
  });
});

describe('monthly report', () => {
  async function marchTracker() {
    const disk = createDisk();
    const tracker = open(disk);
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
    const tracker = open(disk);
    await tracker.importCsv(csvOf('2024-02-10,10.00,Food,x', '2024-03-10,20.00,Food,y'));
    expect(await tracker.report()).toContain('Total: 20.00\n');
    disk.clock.today = '2024-04-02';
    expect(await tracker.report()).toBe(await tracker.report('2024-04'));
    expect(await tracker.report()).toContain('Total: 0.00\n');
    disk.clock.today = '2024-02-29';
    expect(await tracker.report()).toContain('Total: 10.00\n');
  });

  it('reports an empty month', async () => {
    const tracker = open(createDisk());
    expect(await tracker.report('2024-05')).toBe(
      'Expense report for 2024-05\n\nNo expenses.\n\nTotal: 0.00\n\nLargest expenses:\nNone\n',
    );
  });

  it('lists budgeted categories of a month without expenses', async () => {
    const tracker = open(createDisk());
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
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,50.00,Food,'));
    await tracker.setBudget('2024-03', 'Food', 5000);
    expect(await tracker.report('2024-03')).toContain('Food: 50.00 (budget 50.00, 0.00 remaining)');
    await tracker.setBudget('2024-03', 'Food', 4999);
    expect(await tracker.report('2024-03')).toContain(
      'Food: 50.00 (budget 49.99, OVER BUDGET by 0.01)',
    );
  });

  it('treats a zero budget as a budget', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,0.05,Food,'));
    await tracker.setBudget('2024-03', 'Food', 0);
    expect(await tracker.report('2024-03')).toContain(
      'Food: 0.05 (budget 0.00, OVER BUDGET by 0.05)',
    );
  });

  it('orders categories by total spent, largest first', async () => {
    const tracker = open(createDisk());
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
    const tracker = open(createDisk());
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
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,10.00,food,', '2024-03-02,5.00,Food,'));
    const report = await tracker.report('2024-03');
    expect(report).toContain('food: 10.00 (no budget)\nFood: 5.00 (no budget)');
  });

  it('formats money without separators and with two digits', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(
      csvOf('2024-03-01,1234567.89,Big,', '2024-03-02,0.05,Small,', '2024-03-03,1,Exact,'),
    );
    const report = await tracker.report('2024-03');
    expect(report).toContain('Big: 1234567.89 (no budget)');
    expect(report).toContain('Small: 0.05 (no budget)');
    expect(report).toContain('Exact: 1.00 (no budget)');
    expect(report).toContain('Total: 1234568.94\n');
  });

  it('answers invalid months with a message', async () => {
    const tracker = open(createDisk());
    expect(await tracker.report('2024-3')).toBe('Invalid month: 2024-3\n');
    expect(await tracker.report('2024-13')).toBe('Invalid month: 2024-13\n');
    expect(await tracker.report('')).toBe('Invalid month: \n');
    expect(await tracker.report('2024-03-01')).toBe('Invalid month: 2024-03-01\n');
    expect(await tracker.report('x2024-03')).toBe('Invalid month: x2024-03\n');
    expect(await tracker.report('2024-03x')).toBe('Invalid month: 2024-03x\n');
  });

  it('does not write anything', async () => {
    const disk = createDisk();
    const tracker = open(disk);
    await tracker.report('2024-03');
    await tracker.largest('2024-03');
    expect(disk.writes).toEqual([]);
  });
});

describe('largest expenses', () => {
  it('returns the three largest of the month, ties by earlier date then import order', async () => {
    const tracker = open(createDisk());
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
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,', '2024-03-02,2.00,B,'));
    expect(await tracker.largest('2024-03')).toHaveLength(2);
    expect(await tracker.largest('2024-04')).toEqual([]);
  });

  it('omits the note separator when the note is empty', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,', '2024-03-02,2.00,B,two'));
    expect((await tracker.report('2024-03')).split('Largest expenses:\n')[1]).toBe(
      '1. 2024-03-02 B 2.00 - two\n2. 2024-03-01 A 1.00\n',
    );
  });

  it('returns an empty list for an invalid month', async () => {
    const tracker = open(createDisk());
    await tracker.importCsv(csvOf('2024-03-01,1.00,A,'));
    expect(await tracker.largest('2024-3')).toEqual([]);
    expect(await tracker.largest('')).toEqual([]);
  });

  it('survives a round trip through the fake file system', async () => {
    const disk = createDisk();
    await open(disk).importCsv(csvOf('2024-03-01,12.34,Food,"a, b"'));
    expect(await open(disk).largest('2024-03')).toEqual([
      { date: '2024-03-01', amountCents: 1234, category: 'Food', note: 'a, b' },
    ]);
    expect(disk.files.has('data/expenses.json')).toBe(true);
    expect(savedJson(disk, 'data/expenses.json')).not.toBeNull();
  });
});
