import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { reportMain, runReport } from '../src/main/composition-root.js';

const USAGE =
  'Usage: report --input <path> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--format table|csv]\n';

function sale(product: unknown, date: unknown, quantity: unknown, unitPriceCents: unknown) {
  return { product, date, quantity, unitPriceCents };
}

async function run(argv: readonly string[], file: string | Error | { readonly reject: unknown }) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const reads: string[] = [];
  const code = await runReport(argv, {
    readFile: (path) => {
      reads.push(path);
      if (typeof file === 'string') {
        return Promise.resolve(file);
      }
      return Promise.reject(file instanceof Error ? file : file.reject);
    },
    stdout: {
      write: (text) => {
        stdout.push(text);
      },
    },
    stderr: {
      write: (text) => {
        stderr.push(text);
      },
    },
  });
  return { code, out: stdout.join(''), err: stderr.join(''), reads, stdoutCalls: stdout };
}

const json = (value: unknown) => JSON.stringify(value);

const MIXED = json([
  sale('Widget', '2026-01-05', 10, 250),
  sale(' Widget ', '2026-01-06', 2, 250),
  sale('Gadget, "Pro"', '2026-02-01', 3, 300000),
  sale('apple', '2026-02-02', 1, 3000),
  sale('Banana', '2026-02-02', 1, 3000),
  sale('constructor', '2026-02-02', 1, 1),
  sale('__proto__', '2026-02-03', 1, 2),
  sale('toString', '2026-02-03', 4, 0),
]);

describe('runReport table output', () => {
  it('prints totals per product ordered by revenue, then name, with a total row', async () => {
    const { code, out, err, reads } = await run(['--input', 'data/sales.json'], MIXED);
    expect(out).toBe(
      [
        'Product        Units    Revenue',
        'Gadget, "Pro"      3  $9,000.00',
        'apple              1     $30.00',
        'Banana             1     $30.00',
        'Widget            12     $30.00',
        '__proto__          1      $0.02',
        'constructor        1      $0.01',
        'toString           4      $0.00',
        'Total             23  $9,090.03',
        '',
      ].join('\n'),
    );
    expect(err).toBe('');
    expect(code).toBe(0);
    expect(reads).toEqual(['data/sales.json']);
  });

  it('is the default and also selected by --format table', async () => {
    const implicit = await run(['--input', 'f'], MIXED);
    const explicit = await run(['--format', 'table', '--input', 'f'], MIXED);
    expect(explicit.out).toBe(implicit.out);
    expect(explicit.code).toBe(0);
  });

  it('accepts options in any order', async () => {
    const { out, code } = await run(
      ['--to', '2026-01-05', '--format', 'table', '--from', '2026-01-05', '--input', 'f'],
      MIXED,
    );
    expect(out).toBe(
      ['Product  Units  Revenue', 'Widget      10   $25.00', 'Total       10   $25.00', ''].join('\n'),
    );
    expect(code).toBe(0);
  });

  it('sizes each column to its widest cell, header and total row included', async () => {
    const { out } = await run(
      ['--input', 'f'],
      json([sale('A', '2026-01-01', 1, 5), sale('B', '2026-01-01', 1, 1)]),
    );
    expect(out).toBe(
      ['Product  Units  Revenue', 'A            1    $0.05', 'B            1    $0.01', 'Total        2    $0.06', ''].join(
        '\n',
      ),
    );
  });

  it('keeps zero-revenue products and groups large totals', async () => {
    const { out } = await run(
      ['--input', 'f'],
      json([sale('Free', '2026-01-01', 1000000, 0), sale('Gold', '2026-01-01', 1000, 123456)]),
    );
    expect(out).toBe(
      [
        'Product    Units        Revenue',
        'Gold        1000  $1,234,560.00',
        'Free     1000000          $0.00',
        'Total    1001000  $1,234,560.00',
        '',
      ].join('\n'),
    );
  });

  it('treats product names as case-sensitive and trims them', async () => {
    const { out } = await run(
      ['--input', 'f'],
      json([
        sale('tea', '2026-01-01', 1, 100),
        sale('Tea', '2026-01-02', 1, 100),
        sale('  tea\t', '2026-01-03', 1, 100),
      ]),
    );
    expect(out).toBe(
      ['Product  Units  Revenue', 'tea          2    $2.00', 'Tea          1    $1.00', 'Total        3    $3.00', ''].join('\n'),
    );
  });

  it('prints one line when no sale matches', async () => {
    const empty = await run(['--input', 'f'], '[]');
    expect(empty.out).toBe('No sales found\n');
    expect(empty.code).toBe(0);
    const filtered = await run(['--input', 'f', '--from', '2030-01-01'], MIXED);
    expect(filtered.out).toBe('No sales found\n');
    expect(filtered.err).toBe('');
  });
});

describe('runReport date filter', () => {
  it('includes both bounds and leaves out the days around them', async () => {
    const { out } = await run(
      ['--input', 'f', '--from', '2026-01-06', '--to', '2026-02-01'],
      MIXED,
    );
    expect(out).toBe(
      [
        'Product        Units    Revenue',
        'Gadget, "Pro"      3  $9,000.00',
        'Widget             2      $5.00',
        'Total              5  $9,005.00',
        '',
      ].join('\n'),
    );
  });

  it('leaves the upper end open without --to', async () => {
    const { out } = await run(['--input', 'f', '--from', '2026-02-03'], MIXED);
    expect(out).toBe(
      [
        'Product    Units  Revenue',
        '__proto__      1    $0.02',
        'toString       4    $0.00',
        'Total          5    $0.02',
        '',
      ].join('\n'),
    );
  });

  it('leaves the lower end open without --from', async () => {
    const { out } = await run(['--input', 'f', '--to', '2026-01-05'], MIXED);
    expect(out).toBe(
      ['Product  Units  Revenue', 'Widget      10   $25.00', 'Total       10   $25.00', ''].join('\n'),
    );
  });

  it('accepts equal bounds and leap days', async () => {
    const leap = json([sale('Leap', '2024-02-29', 1, 100), sale('Other', '2024-03-01', 1, 100)]);
    const { out, code } = await run(
      ['--input', 'f', '--from', '2024-02-29', '--to', '2024-02-29'],
      leap,
    );
    expect(out).toBe(
      ['Product  Units  Revenue', 'Leap         1    $1.00', 'Total        1    $1.00', ''].join('\n'),
    );
    expect(code).toBe(0);
  });
});

describe('runReport csv output', () => {
  it('prints a header and one line per product, without a total row', async () => {
    const { code, out, err } = await run(['--input', 'f', '--format', 'csv'], MIXED);
    expect(out).toBe(
      [
        'product,units,revenue',
        '"Gadget, ""Pro""",3,"$9,000.00"',
        'apple,1,$30.00',
        'Banana,1,$30.00',
        'Widget,12,$30.00',
        '__proto__,1,$0.02',
        'constructor,1,$0.01',
        'toString,4,$0.00',
        '',
      ].join('\n'),
    );
    expect(err).toBe('');
    expect(code).toBe(0);
  });

  it('quotes a field holding a comma, a double quote, a line feed or a carriage return', async () => {
    const { out } = await run(
      ['--input', 'f', '--format', 'csv'],
      json([
        sale('a,b', '2026-01-01', 1, 900),
        sale('say "hi"', '2026-01-01', 1, 800),
        sale('two\nlines', '2026-01-01', 1, 700),
        sale('car\rriage', '2026-01-01', 1, 600),
        sale('""', '2026-01-01', 1, 500),
        sale('tab\tonly', '2026-01-01', 1, 400),
        sale('semi;colon', '2026-01-01', 1, 300),
      ]),
    );
    expect(out).toBe(
      [
        'product,units,revenue',
        '"a,b",1,$9.00',
        '"say ""hi""",1,$8.00',
        '"two\nlines",1,$7.00',
        '"car\rriage",1,$6.00',
        '"""""",1,$5.00',
        'tab\tonly,1,$4.00',
        'semi;colon,1,$3.00',
        '',
      ].join('\n'),
    );
  });

  it('prints only the header when no sale matches', async () => {
    const { out, code } = await run(['--input', 'f', '--format', 'csv', '--to', '2000-01-01'], MIXED);
    expect(out).toBe('product,units,revenue\n');
    expect(code).toBe(0);
  });

  it('applies the date filter', async () => {
    const { out } = await run(
      ['--format', 'csv', '--input', 'f', '--from', '2026-02-03'],
      MIXED,
    );
    expect(out).toBe('product,units,revenue\n__proto__,1,$0.02\ntoString,4,$0.00\n');
  });
});

describe('runReport usage errors', () => {
  it.each([
    [[], 'Missing required option: --input'],
    [['--format', 'csv'], 'Missing required option: --input'],
    [['--help'], 'Unknown argument: --help'],
    [['--input', 'f', 'report'], 'Unknown argument: report'],
    [['--input', 'f', '--input=g'], 'Unknown argument: --input=g'],
    [['--input', 'f', '-f', 'csv'], 'Unknown argument: -f'],
    [['--input', 'a', '--input', 'b'], 'Duplicate option: --input'],
    [['--from', '2026-01-01', '--input', 'f', '--from', '2026-01-02'], 'Duplicate option: --from'],
    [['--input', 'f', '--format', 'csv', '--format', 'csv'], 'Duplicate option: --format'],
    [['--input'], 'Missing value for --input'],
    [['--input', 'f', '--to'], 'Missing value for --to'],
    [['--input', 'f', '--format'], 'Missing value for --format'],
    [['--input', 'f', '--from', '2026-02-30'], 'Invalid date for --from: 2026-02-30'],
    [['--input', 'f', '--from', '2026-13-01'], 'Invalid date for --from: 2026-13-01'],
    [['--input', 'f', '--to', '2025-02-29'], 'Invalid date for --to: 2025-02-29'],
    [['--input', 'f', '--to', '2026-1-5'], 'Invalid date for --to: 2026-1-5'],
    [['--input', 'f', '--from', '20260105'], 'Invalid date for --from: 20260105'],
    [['--input', 'f', '--from', '2026-01-05T10:00:00Z'], 'Invalid date for --from: 2026-01-05T10:00:00Z'],
    [['--input', 'f', '--to', ''], 'Invalid date for --to: '],
    [['--input', 'f', '--format', 'xml'], 'Invalid format: xml'],
    [['--input', 'f', '--format', 'CSV'], 'Invalid format: CSV'],
    [['--input', 'f', '--from', '2026-03-01', '--to', '2026-02-28'], '--from must not be after --to'],
  ])('rejects %j', async (argv, message) => {
    const { code, out, err, reads } = await run(argv, MIXED);
    expect(err).toBe(`${message}\n${USAGE}`);
    expect(out).toBe('');
    expect(code).toBe(2);
    expect(reads).toEqual([]);
  });

  it.each([
    [['--from', 'x', '--to', 'y', '--format', 'z', '--bogus'], 'Unknown argument: --bogus'],
    [['--from', 'x', '--to', 'y', '--format', 'z', '--format'], 'Duplicate option: --format'],
    [['--from', 'x', '--to', 'y', '--format', 'z'], 'Missing required option: --input'],
    [['--input', 'f', '--from', 'x', '--to', 'y', '--format', 'z'], 'Invalid date for --from: x'],
    [['--input', 'f', '--to', 'y', '--format', 'z'], 'Invalid date for --to: y'],
    [['--input', 'f', '--format', 'z', '--from', '2026-03-01', '--to', '2026-01-01'], 'Invalid format: z'],
    [['--input', 'f', '--from', 'x', '--bogus'], 'Unknown argument: --bogus'],
    [['--input', 'f', '--from', 'x', '--to'], 'Missing value for --to'],
  ])('reports only the first problem of %j', async (argv, message) => {
    const { err, code } = await run(argv, MIXED);
    expect(err).toBe(`${message}\n${USAGE}`);
    expect(code).toBe(2);
  });

  it('takes the argument after an option as its value, whatever it looks like', async () => {
    const { reads, err, code } = await run(['--input', '--format', '--format', 'csv'], '[]');
    expect(reads).toEqual(['--format']);
    expect(err).toBe('');
    expect(code).toBe(0);
  });
});

describe('runReport input failures', () => {
  it('reports a rejected read with the error message', async () => {
    const { code, out, err, reads } = await run(['--input', 'gone.json'], new Error('ENOENT: nope'));
    expect(err).toBe('Could not read gone.json: ENOENT: nope\n');
    expect(out).toBe('');
    expect(code).toBe(1);
    expect(reads).toEqual(['gone.json']);
  });

  it('reports a rejection that is not an Error by its string form', async () => {
    const { err, code } = await run(['--input', 'gone.json'], { reject: 'denied' });
    expect(err).toBe('Could not read gone.json: denied\n');
    expect(code).toBe(1);
  });

  it.each([
    ['', 'Malformed JSON in s.json'],
    ['   ', 'Malformed JSON in s.json'],
    ['[{"product": "A"', 'Malformed JSON in s.json'],
    ["[{'product': 'A'}]", 'Malformed JSON in s.json'],
    ['{}', 'Expected a JSON array in s.json'],
    ['{"sales": []}', 'Expected a JSON array in s.json'],
    ['null', 'Expected a JSON array in s.json'],
    ['42', 'Expected a JSON array in s.json'],
    ['"[]"', 'Expected a JSON array in s.json'],
    ['[1]', 'Invalid record #0 in s.json: not an object'],
    ['["x"]', 'Invalid record #0 in s.json: not an object'],
    ['[null]', 'Invalid record #0 in s.json: not an object'],
    ['[true]', 'Invalid record #0 in s.json: not an object'],
    ['[[]]', 'Invalid record #0 in s.json: not an object'],
    ['[[1, 2, 3, 4]]', 'Invalid record #0 in s.json: not an object'],
  ])('rejects the file text %j', async (text, message) => {
    const { code, out, err } = await run(['--input', 's.json'], text);
    expect(err).toBe(`${message}\n`);
    expect(out).toBe('');
    expect(code).toBe(1);
  });

  const valid = sale('Ok', '2026-01-01', 1, 1);

  it.each([
    [sale(undefined, '2026-01-01', 1, 1), 'product'],
    [sale(null, '2026-01-01', 1, 1), 'product'],
    [sale(7, '2026-01-01', 1, 1), 'product'],
    [sale('', '2026-01-01', 1, 1), 'product'],
    [sale(' \t ', '2026-01-01', 1, 1), 'product'],
    [sale('A', undefined, 1, 1), 'date'],
    [sale('A', 20260101, 1, 1), 'date'],
    [sale('A', '2026-02-30', 1, 1), 'date'],
    [sale('A', '2026-04-31', 1, 1), 'date'],
    [sale('A', '2025-02-29', 1, 1), 'date'],
    [sale('A', '2026-1-1', 1, 1), 'date'],
    [sale('A', ' 2026-01-01', 1, 1), 'date'],
    [sale('A', '2026-01-01T00:00:00Z', 1, 1), 'date'],
    [sale('A', '01/02/2026', 1, 1), 'date'],
    [sale('A', '2026-01-01', undefined, 1), 'quantity'],
    [sale('A', '2026-01-01', null, 1), 'quantity'],
    [sale('A', '2026-01-01', '3', 1), 'quantity'],
    [sale('A', '2026-01-01', 0, 1), 'quantity'],
    [sale('A', '2026-01-01', -2, 1), 'quantity'],
    [sale('A', '2026-01-01', 1.5, 1), 'quantity'],
    [sale('A', '2026-01-01', 1, undefined), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, null), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, '5'), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, -1), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, 2.5), 'unitPriceCents'],
    [sale('', 'x', 0, -1), 'product'],
    [sale('A', 'x', 0, -1), 'date'],
    [sale('A', '2026-01-01', 0, -1), 'quantity'],
    [{}, 'product'],
    [{ product: 'A' }, 'date'],
    [{ product: 'A', date: '2026-01-01' }, 'quantity'],
    [{ product: 'A', date: '2026-01-01', quantity: 1 }, 'unitPriceCents'],
  ])('names the first invalid property of %j', async (record, field) => {
    const { code, out, err } = await run(['--input', 's.json'], json([valid, valid, record, 9]));
    expect(err).toBe(`Invalid record #2 in s.json: ${field}\n`);
    expect(out).toBe('');
    expect(code).toBe(1);
  });

  it('validates every record, including those outside the date range', async () => {
    const { code, out, err } = await run(
      ['--input', 's.json', '--from', '2030-01-01', '--to', '2030-12-31'],
      json([valid, sale('Late', '2026-13-01', 1, 1)]),
    );
    expect(err).toBe('Invalid record #1 in s.json: date\n');
    expect(out).toBe('');
    expect(code).toBe(1);
  });

  it('accepts free items and ignores extra properties', async () => {
    const { code, out } = await run(
      ['--input', 's.json'],
      json([{ ...sale('Freebie', '2024-02-29', 2, 0), note: 'x', nested: { a: [1] } }]),
    );
    expect(out).toBe(
      ['Product  Units  Revenue', 'Freebie      2    $0.00', 'Total        2    $0.00', ''].join('\n'),
    );
    expect(code).toBe(0);
  });
});

describe('reportMain', () => {
  async function fileWith(contents: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'report-acceptance-'));
    const file = join(directory, 'sales.json');
    await writeFile(file, contents);
    return file;
  }

  it('reads the real file and writes the report to standard output', async () => {
    const file = await fileWith(json([sale('Widget', '2026-01-05', 2, 250), sale('Gadget', '2026-01-06', 1, 100)]));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await reportMain(['--input', file, '--format', 'csv']);
    const written = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(written).toBe('product,units,revenue\nWidget,2,$5.00\nGadget,1,$1.00\n');
    expect(stderr).not.toHaveBeenCalled();
    expect(code).toBe(0);
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('writes failures to standard error and returns the exit code', async () => {
    const file = await fileWith('{');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await reportMain(['--input', file]);
    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(written).toBe(`Malformed JSON in ${file}\n`);
    expect(stdout).not.toHaveBeenCalled();
    expect(code).toBe(1);
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('returns 2 for a usage error and an unreadable file alike', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const usage = await reportMain([]);
    const missing = await reportMain(['--input', '/nonexistent/dir/sales.json']);
    expect(usage).toBe(2);
    expect(missing).toBe(1);
    stderr.mockRestore();
  });
});
