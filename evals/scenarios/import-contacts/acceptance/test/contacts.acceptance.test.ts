import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { importContactsMain } from '../src/main/composition-root.js';
import { importContacts } from '../src/main/features/contacts/index.js';

async function run(text: string, path = 'contacts.json') {
  const chunks: string[] = [];
  const reads: string[] = [];
  const result = await importContacts(
    path,
    (file) => {
      reads.push(file);
      return Promise.resolve(text);
    },
    {
      write: (chunk) => {
        chunks.push(chunk);
      },
    },
  );
  return { result, chunks, reads, output: chunks.join('') };
}

const json = (value: unknown) => JSON.stringify(value);

describe('imported contacts', () => {
  it('reads the given path exactly once', async () => {
    const { reads } = await run('[]', 'dir/people.json');
    expect(reads).toEqual(['dir/people.json']);
  });

  it('imports valid records, trimming names and normalizing emails', async () => {
    const { result, output } = await run(
      json([
        { name: '  Ada Lovelace ', email: '  Ada@Example.COM ', phone: '123', extra: { a: 1 } },
        { name: 'Grace', email: 'grace@mail.example.org' },
      ]),
    );
    expect(result).toEqual({
      kind: 'imported',
      contacts: [
        { name: 'Ada Lovelace', email: 'ada@example.com' },
        { name: 'Grace', email: 'grace@mail.example.org' },
      ],
      rejected: [],
    });
    expect(output).toBe('Imported 2 contacts\n');
  });

  it('uses the plural word for one and zero contacts', async () => {
    expect((await run(json([{ name: 'A', email: 'a@b.co' }]))).output).toBe(
      'Imported 1 contacts\n',
    );
    expect((await run('[]')).output).toBe('Imported 0 contacts\n');
  });

  it('writes each line as its own call ending with a newline', async () => {
    const { chunks } = await run(json([{ name: 'A', email: 'a@b.co' }, 5, null]));
    expect(chunks).toEqual([
      'Imported 1 contacts\n',
      'Rejected #1: not an object\n',
      'Rejected #2: not an object\n',
    ]);
  });

  it('accepts surrounding whitespace in the JSON text', async () => {
    const { result } = await run(`\n  [ {"name":"A","email":"a@b.co"} ]  \n`);
    expect(result).toEqual({
      kind: 'imported',
      contacts: [{ name: 'A', email: 'a@b.co' }],
      rejected: [],
    });
  });
});

describe('rejected records', () => {
  it('rejects values that are not objects', async () => {
    const { result, output } = await run(
      '[1, null, "x", [], true, [{"name":"A","email":"a@b.co"}]]',
    );
    expect(output).toBe(
      [
        'Imported 0 contacts',
        'Rejected #0: not an object',
        'Rejected #1: not an object',
        'Rejected #2: not an object',
        'Rejected #3: not an object',
        'Rejected #4: not an object',
        'Rejected #5: not an object',
        '',
      ].join('\n'),
    );
    expect(result).toEqual({
      kind: 'imported',
      contacts: [],
      rejected: [0, 1, 2, 3, 4, 5].map((index) => ({ index, reason: 'not an object' })),
    });
  });

  it('rejects a missing, non-string or blank name', async () => {
    const { output } = await run(
      json([
        { email: 'a@b.co' },
        { name: 5, email: 'b@b.co' },
        { name: null, email: 'c@b.co' },
        { name: '', email: 'd@b.co' },
        { name: ' \t ', email: 'e@b.co' },
      ]),
    );
    expect(output).toBe(
      'Imported 0 contacts\n' +
        [0, 1, 2, 3, 4].map((index) => `Rejected #${String(index)}: invalid name\n`).join(''),
    );
  });

  it('rejects a missing, non-string or malformed email', async () => {
    const emails: readonly unknown[] = [
      undefined,
      7,
      null,
      '',
      '   ',
      'plain',
      'ada@localhost',
      '@example.com',
      'ada@',
      'ada lovelace@example.com',
      'a@@example.com',
      'a@b@example.com',
    ];
    const { result } = await run(json(emails.map((email) => ({ name: 'Ada', email }))));
    expect(result).toEqual({
      kind: 'imported',
      contacts: [],
      rejected: emails.map((_, index) => ({ index, reason: 'invalid email' })),
    });
  });

  it('reports the invalid name when both fields are invalid', async () => {
    const { output } = await run(json([{ name: ' ', email: 'nope' }, {}]));
    expect(output).toBe(
      'Imported 0 contacts\nRejected #0: invalid name\nRejected #1: invalid name\n',
    );
  });

  it('reports rejections in input order between valid records', async () => {
    const { output } = await run(
      json([
        { name: 'A', email: 'a@b.co' },
        3,
        { name: 'B', email: 'b@b.co' },
        { name: '', email: 'c@b.co' },
        { name: 'D', email: 'bad' },
      ]),
    );
    expect(output).toBe(
      'Imported 2 contacts\nRejected #1: not an object\nRejected #3: invalid name\nRejected #4: invalid email\n',
    );
  });
});

describe('de-duplication', () => {
  it('keeps the first record for an email, ignoring case and spacing', async () => {
    const { result, output } = await run(
      json([
        { name: 'First', email: 'x@example.com' },
        { name: 'Bad', email: 'bad' },
        { name: 'Second', email: ' X@EXAMPLE.com ' },
        { name: 'Other', email: 'y@example.com' },
        { name: 'Third', email: 'x@example.com' },
        { name: 'Fourth', email: 'Y@Example.Com' },
      ]),
    );
    expect(result).toEqual({
      kind: 'imported',
      contacts: [
        { name: 'First', email: 'x@example.com' },
        { name: 'Other', email: 'y@example.com' },
      ],
      rejected: [
        { index: 1, reason: 'invalid email' },
        { index: 2, reason: 'duplicate of #0' },
        { index: 4, reason: 'duplicate of #0' },
        { index: 5, reason: 'duplicate of #3' },
      ],
    });
    expect(output).toBe(
      [
        'Imported 2 contacts',
        'Rejected #1: invalid email',
        'Rejected #2: duplicate of #0',
        'Rejected #4: duplicate of #0',
        'Rejected #5: duplicate of #3',
        '',
      ].join('\n'),
    );
  });

  it('does not let a rejected record claim its email', async () => {
    const { result } = await run(
      json([
        { name: '', email: 'x@example.com' },
        { name: 'Real', email: 'x@example.com' },
      ]),
    );
    expect(result).toEqual({
      kind: 'imported',
      contacts: [{ name: 'Real', email: 'x@example.com' }],
      rejected: [{ index: 0, reason: 'invalid name' }],
    });
  });

  it('refers to the kept record by its input index when earlier records were rejected', async () => {
    const { output } = await run(
      json([1, 2, { name: 'A', email: 'a@b.co' }, { name: 'B', email: 'a@b.co' }]),
    );
    expect(output).toBe(
      'Imported 1 contacts\nRejected #0: not an object\nRejected #1: not an object\nRejected #3: duplicate of #2\n',
    );
  });
});

describe('expected failures', () => {
  it('reports malformed JSON without throwing', async () => {
    const reportsMalformed = async (text: string) => {
      const { result, output } = await run(text, 'bad.json');
      expect(result).toEqual({ kind: 'malformed-json' });
      expect(output).toBe('Malformed JSON in bad.json\n');
    };
    await reportsMalformed('');
    await reportsMalformed('[{"name":');
    await reportsMalformed('not json');
    await reportsMalformed("[{'name':'A'}]");
    await reportsMalformed('[1,]');
  });

  it('reports valid JSON that is not an array', async () => {
    const reportsNotArray = async (text: string) => {
      const { result, output } = await run(text, 'obj.json');
      expect(result).toEqual({ kind: 'not-an-array' });
      expect(output).toBe('Expected a JSON array in obj.json\n');
    };
    await reportsNotArray('{"name":"Ada","email":"a@b.co"}');
    await reportsNotArray('null');
    await reportsNotArray('"text"');
    await reportsNotArray('42');
    await reportsNotArray('true');
  });

  it('reports a failed read using the error message', async () => {
    const chunks: string[] = [];
    const result = await importContacts(
      'missing.json',
      () => Promise.reject(new Error('disk on fire')),
      {
        write: (chunk) => {
          chunks.push(chunk);
        },
      },
    );
    expect(result).toEqual({ kind: 'read-failed', message: 'disk on fire' });
    expect(chunks).toEqual(['Could not read missing.json: disk on fire\n']);
  });

  it('reports a rejection that is not an Error by its string form', async () => {
    const chunks: string[] = [];
    const result = await importContacts('x.json', () => Promise.reject('denied'), {
      write: (chunk) => {
        chunks.push(chunk);
      },
    });
    expect(result).toEqual({ kind: 'read-failed', message: 'denied' });
    expect(chunks).toEqual(['Could not read x.json: denied\n']);
  });
});

describe('importContactsMain', () => {
  it('reads the file from disk and reports on standard output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contacts-acceptance-'));
    const file = join(directory, 'contacts.json');
    await writeFile(
      file,
      json([
        { name: ' Ada ', email: 'ADA@example.com' },
        { name: 'Ada again', email: 'ada@example.com' },
        { name: 'Bo', email: 'nope' },
      ]),
    );
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await importContactsMain(file);
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    write.mockRestore();
    expect(output).toBe(
      'Imported 1 contacts\nRejected #1: duplicate of #0\nRejected #2: invalid email\n',
    );
  });

  it('reports malformed JSON read from disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contacts-acceptance-'));
    const file = join(directory, 'broken.json');
    await writeFile(file, '{oops');
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await importContactsMain(file);
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    write.mockRestore();
    expect(output).toBe(`Malformed JSON in ${file}\n`);
  });

  it('reports a missing file without throwing', async () => {
    const file = join(tmpdir(), 'contacts-acceptance-does-not-exist', 'nothing.json');
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await importContactsMain(file);
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    write.mockRestore();
    expect(output.startsWith(`Could not read ${file}: `)).toBe(true);
    expect(output).toContain('ENOENT');
    expect(output.endsWith('\n')).toBe(true);
  });
});
