import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { reportMain, runReport } from '../src/main/composition-root.js';

type Sale = {
  readonly product: unknown;
  readonly date: unknown;
  readonly quantity: unknown;
  readonly unitPriceCents: unknown;
};

function sale(product: unknown, date: unknown, quantity: unknown, unitPriceCents: unknown): Sale {
  return { product, date, quantity, unitPriceCents };
}

async function run(argv: readonly string[], text: string) {
  const out: string[] = [];
  const err: string[] = [];
  const readFile = vi.fn((path: string) => Promise.resolve(path === 'sales.json' ? text : ''));
  const code = await runReport(argv, {
    readFile,
    stdout: {
      write: (chunk) => {
        out.push(chunk);
      },
    },
    stderr: {
      write: (chunk) => {
        err.push(chunk);
      },
    },
  });
  return { code, stdout: out.join(''), stderr: err.join(''), readFile };
}

const USAGE =
  'Usage: report --input <path> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--format table|csv]\n';

const SALES = JSON.stringify([
  sale('Widget', '2026-01-05', 10, 250),
  sale(' Widget ', '2026-01-06', 2, 250),
  sale('Gadget, "Pro"', '2026-02-01', 3, 300000),
  sale('apple', '2026-02-02', 1, 3000),
  sale('Banana', '2026-02-02', 1, 3000),
  sale('constructor', '2026-02-02', 1, 1),
  sale('__proto__', '2026-02-03', 1, 2),
]);

const INPUT = ['--input', 'sales.json'];

describe('report table', () => {
  it('prints totals per product, largest revenue first, then by name', async () => {
    const { code, stdout, stderr } = await run(INPUT, SALES);
    expect(stdout).toBe(
      [
        'Product        Units    Revenue',
        'Gadget, "Pro"      3  $9,000.00',
        'apple              1     $30.00',
        'Banana             1     $30.00',
        'Widget            12     $30.00',
        '__proto__          1      $0.02',
        'constructor        1      $0.01',
        'Total             19  $9,090.03',
        '',
      ].join('\n'),
    );
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  it('reads the input file once', async () => {
    const { readFile } = await run(INPUT, SALES);
    expect(readFile.mock.calls).toEqual([['sales.json']]);
  });

  it('is the default format and accepts the explicit one', async () => {
    const implicit = await run(INPUT, SALES);
    const explicit = await run([...INPUT, '--format', 'table'], SALES);
    expect(explicit.stdout).toBe(implicit.stdout);
  });

  it('keeps the header and total widths when they are the widest cells', async () => {
    const { stdout } = await run(INPUT, JSON.stringify([sale('A', '2026-01-01', 1, 0)]));
    expect(stdout).toBe(
      ['Product  Units  Revenue', 'A            1    $0.00', 'Total        1    $0.00', ''].join(
        '\n',
      ),
    );
  });

  it('prints one line when nothing matches', async () => {
    const { code, stdout } = await run(INPUT, '[]');
    expect(stdout).toBe('No sales found\n');
    expect(code).toBe(0);
  });
});

describe('report date filter', () => {
  it('includes both bounds', async () => {
    const { stdout } = await run([...INPUT, '--from', '2026-01-06', '--to', '2026-02-01'], SALES);
    expect(stdout).toBe(
      [
        'Product        Units    Revenue',
        'Gadget, "Pro"      3  $9,000.00',
        'Widget             2      $5.00',
        'Total              5  $9,005.00',
        '',
      ].join('\n'),
    );
  });

  it('leaves the end open without --to', async () => {
    const { stdout } = await run([...INPUT, '--from', '2026-02-03'], SALES);
    expect(stdout).toBe(
      [
        'Product    Units  Revenue',
        '__proto__      1    $0.02',
        'Total          1    $0.02',
        '',
      ].join('\n'),
    );
  });

  it('leaves the start open without --from', async () => {
    const { stdout } = await run([...INPUT, '--to', '2026-01-05'], SALES);
    expect(stdout).toBe(
      ['Product  Units  Revenue', 'Widget      10   $25.00', 'Total       10   $25.00', ''].join(
        '\n',
      ),
    );
  });

  it('accepts a single-day range', async () => {
    const { stdout } = await run([...INPUT, '--from', '2026-02-03', '--to', '2026-02-03'], SALES);
    expect(stdout).toBe(
      [
        'Product    Units  Revenue',
        '__proto__      1    $0.02',
        'Total          1    $0.02',
        '',
      ].join('\n'),
    );
  });

  it('prints only the csv header when nothing matches', async () => {
    const { code, stdout } = await run(
      [...INPUT, '--from', '2030-01-01', '--format', 'csv'],
      SALES,
    );
    expect(stdout).toBe('product,units,revenue\n');
    expect(code).toBe(0);
  });
});

describe('report csv', () => {
  it('quotes fields that hold a comma, a quote or a line break', async () => {
    const { stdout } = await run(
      [...INPUT, '--format', 'csv'],
      JSON.stringify([
        sale('plain', '2026-01-01', 1, 100000),
        sale('a,b', '2026-01-01', 1, 90000),
        sale('say "hi"', '2026-01-01', 1, 80000),
        sale('two\nlines', '2026-01-01', 1, 70000),
        sale('car\rriage', '2026-01-01', 1, 60000),
        sale('Zed', '2026-01-01', 1, 5),
      ]),
    );
    expect(stdout).toBe(
      [
        'product,units,revenue',
        'plain,1,"$1,000.00"',
        '"a,b",1,$900.00',
        '"say ""hi""",1,$800.00',
        '"two\nlines",1,$700.00',
        '"car\rriage",1,$600.00',
        'Zed,1,$0.05',
        '',
      ].join('\n'),
    );
  });
});

describe('report usage errors', () => {
  it.each([
    [[], 'Missing required option: --input'],
    [['--bogus'], 'Unknown argument: --bogus'],
    [['--input', 'sales.json', 'extra'], 'Unknown argument: extra'],
    [['--input=sales.json'], 'Unknown argument: --input=sales.json'],
    [['--input', 'a', '--input', 'b'], 'Duplicate option: --input'],
    [['--input', 'a', '--from', '2026-01-01', '--from', '2026-01-02'], 'Duplicate option: --from'],
    [['--input', 'a', '--format'], 'Missing value for --format'],
    [['--input'], 'Missing value for --input'],
    [['--format', 'csv'], 'Missing required option: --input'],
    [[...INPUT, '--from', '2026-02-30'], 'Invalid date for --from: 2026-02-30'],
    [[...INPUT, '--to', '2026-1-5'], 'Invalid date for --to: 2026-1-5'],
    [[...INPUT, '--from', '2026-01-01T00:00:00Z'], 'Invalid date for --from: 2026-01-01T00:00:00Z'],
    [[...INPUT, '--format', 'xml'], 'Invalid format: xml'],
    [[...INPUT, '--from', '2026-03-01', '--to', '2026-02-01'], '--from must not be after --to'],
  ])('rejects %j', async (argv, message) => {
    const { code, stdout, stderr, readFile } = await run(argv, SALES);
    expect(stderr).toBe(`${message}\n${USAGE}`);
    expect(stdout).toBe('');
    expect(code).toBe(2);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reports only the first problem, in the documented order', async () => {
    const { stderr } = await run(
      ['--from', 'nope', '--to', 'nope', '--format', 'xml', '--bogus'],
      SALES,
    );
    expect(stderr).toBe(`Unknown argument: --bogus\n${USAGE}`);
    const later = await run(['--from', 'nope', '--to', 'nope', '--format', 'xml'], SALES);
    expect(later.stderr).toBe(`Missing required option: --input\n${USAGE}`);
    const dates = await run([...INPUT, '--from', 'nope', '--to', 'nope', '--format', 'xml'], SALES);
    expect(dates.stderr).toBe(`Invalid date for --from: nope\n${USAGE}`);
    const to = await run([...INPUT, '--to', 'nope', '--format', 'xml'], SALES);
    expect(to.stderr).toBe(`Invalid date for --to: nope\n${USAGE}`);
  });

  it('takes the argument after an option as its value, even an option name', async () => {
    const { code, readFile } = await run(['--input', '--from', '--from', '2026-01-01'], SALES);
    expect(readFile.mock.calls).toEqual([['--from']]);
    expect(code).toBe(1);
  });
});

describe('report input failures', () => {
  it('reports a rejected read with the error message', async () => {
    const readFile = vi
      .fn<(path: string) => Promise<string>>()
      .mockRejectedValue(new Error('boom'));
    const err: string[] = [];
    const code = await runReport(['--input', 'x.json'], {
      readFile,
      stdout: { write: () => undefined },
      stderr: {
        write: (chunk) => {
          err.push(chunk);
        },
      },
    });
    expect(err).toEqual(['Could not read x.json: boom\n']);
    expect(code).toBe(1);
  });

  it('reports a rejection that is not an Error by its string form', async () => {
    const readFile = vi.fn<(path: string) => Promise<string>>().mockRejectedValue(42);
    const err: string[] = [];
    await runReport(['--input', 'x.json'], {
      readFile,
      stdout: { write: () => undefined },
      stderr: {
        write: (chunk) => {
          err.push(chunk);
        },
      },
    });
    expect(err).toEqual(['Could not read x.json: 42\n']);
  });

  it.each([
    ['', 'Malformed JSON in sales.json'],
    ['[{"product":', 'Malformed JSON in sales.json'],
    ['{}', 'Expected a JSON array in sales.json'],
    ['null', 'Expected a JSON array in sales.json'],
    ['"text"', 'Expected a JSON array in sales.json'],
    ['[1]', 'Invalid record #0 in sales.json: not an object'],
    ['[null]', 'Invalid record #0 in sales.json: not an object'],
    ['[[]]', 'Invalid record #0 in sales.json: not an object'],
  ])('rejects the text %j', async (text, message) => {
    const { code, stdout, stderr } = await run(INPUT, text);
    expect(stderr).toBe(`${message}\n`);
    expect(stdout).toBe('');
    expect(code).toBe(1);
  });

  it.each([
    [sale(undefined, '2026-01-01', 1, 1), 'product'],
    [sale(7, '2026-01-01', 1, 1), 'product'],
    [sale('   ', '2026-01-01', 1, 1), 'product'],
    [sale('A', undefined, 1, 1), 'date'],
    [sale('A', 20260101, 1, 1), 'date'],
    [sale('A', '2026-02-30', 1, 1), 'date'],
    [sale('A', ' 2026-01-01', 1, 1), 'date'],
    [sale('A', '2026-01-01', undefined, 1), 'quantity'],
    [sale('A', '2026-01-01', '3', 1), 'quantity'],
    [sale('A', '2026-01-01', 0, 1), 'quantity'],
    [sale('A', '2026-01-01', 1.5, 1), 'quantity'],
    [sale('A', '2026-01-01', -2, 1), 'quantity'],
    [sale('A', '2026-01-01', 1, undefined), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, '5'), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, -1), 'unitPriceCents'],
    [sale('A', '2026-01-01', 1, 2.5), 'unitPriceCents'],
    [sale('', 'x', 0, -1), 'product'],
    [sale('A', 'x', 0, -1), 'date'],
    [sale('A', '2026-01-01', 0, -1), 'quantity'],
  ])('names the first invalid property of %j', async (record, field) => {
    const valid = sale('B', '2026-01-01', 1, 1);
    const { code, stdout, stderr } = await run(INPUT, JSON.stringify([valid, valid, record]));
    expect(stderr).toBe(`Invalid record #2 in sales.json: ${field}\n`);
    expect(stdout).toBe('');
    expect(code).toBe(1);
  });

  it('reports the first invalid record and validates records outside the date range', async () => {
    const { stderr } = await run(
      [...INPUT, '--from', '2030-01-01'],
      JSON.stringify([sale('A', '2026-01-01', 1, 1), 5, sale('', '2026-01-01', 1, 1)]),
    );
    expect(stderr).toBe('Invalid record #1 in sales.json: not an object\n');
  });

  it('accepts a free item and ignores extra properties', async () => {
    const { code, stdout } = await run(
      INPUT,
      JSON.stringify([{ ...sale('Freebie', '2024-02-29', 2, 0), note: 'x' }]),
    );
    expect(stdout).toBe(
      ['Product  Units  Revenue', 'Freebie      2    $0.00', 'Total        2    $0.00', ''].join(
        '\n',
      ),
    );
    expect(code).toBe(0);
  });
});

describe('reportMain', () => {
  it('reads the file and writes the report to standard output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'report-'));
    const file = join(directory, 'sales.json');
    await writeFile(file, JSON.stringify([sale('Widget', '2026-01-05', 2, 250)]));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await reportMain(['--input', file, '--format', 'csv']);
    expect(write).toHaveBeenCalledExactlyOnceWith('product,units,revenue\nWidget,2,$5.00\n');
    expect(code).toBe(0);
    write.mockRestore();
  });

  it('writes errors to standard error', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await reportMain(['--input', '/nonexistent/sales.json']);
    expect(write).toHaveBeenCalledOnce();
    expect(code).toBe(1);
    write.mockRestore();
  });
});
