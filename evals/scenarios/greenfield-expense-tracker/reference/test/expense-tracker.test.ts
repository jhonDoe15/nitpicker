import { describe, expect, it } from 'vitest';
import { createDisk, open, csvOf, reportText, HEADER } from './support/expense-harness.js';

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
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'E: 19.99 (no budget)',
        'D: 8.20 (no budget)',
        'C: 4.35 (no budget)',
        'A: 1.15 (no budget)',
        'B: 0.29 (no budget)',
        '',
        'Total: 33.98',
        '',
        'Largest expenses:',
        '1. 2024-03-05 E 19.99',
        '2. 2024-03-04 D 8.20',
        '3. 2024-03-03 C 4.35',
      ),
    );
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
      {
        date: '2024-03-08',
        amountCents: 123450,
        category: 'Dining, out',
        note: 'He said "hi", twice',
      },
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
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 13.00 (no budget)',
        '',
        'Total: 13.00',
        '',
        'Largest expenses:',
        '1. 2024-03-01 Food 10.00 - ok',
        '2. 2024-03-11 Food 3.00 - ok too',
      ),
    );
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
    const result = await tracker.importCsv(
      csvOf('2024-12-31,5.00,Food,x', '2024-01-01,5.00,Food,y'),
    );
    expect(result).toEqual({ imported: 2, errors: [] });
  });

  it('accepts a leap day and today itself', async () => {
    const tracker = open(createDisk({}, '2024-03-15'));
    const result = await tracker.importCsv(
      csvOf('2024-02-29,5.00,Food,x', '2024-03-15,5.00,Food,y'),
    );
    expect(result).toEqual({ imported: 2, errors: [] });
  });

  it('rejects the whole import when the header is wrong or missing', async () => {
    const disk = createDisk();
    const tracker = open(disk);
    const invalid = { imported: 0, errors: [{ line: 1, reason: 'Invalid header' }] };
    expect(await tracker.importCsv('2024-03-01,5.00,Food,x')).toEqual(invalid);
    expect(await tracker.importCsv('date,amount,category\n2024-03-01,5.00,Food,x')).toEqual(
      invalid,
    );
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
    expect(await tracker.report('2024-03')).toBe(
      reportText(
        'Expense report for 2024-03',
        '',
        'Food: 30.00 (no budget)',
        '',
        'Total: 30.00',
        '',
        'Largest expenses:',
        '1. 2024-03-02 Food 20.00 - b',
        '2. 2024-03-01 Food 10.00 - a',
      ),
    );
  });
});
