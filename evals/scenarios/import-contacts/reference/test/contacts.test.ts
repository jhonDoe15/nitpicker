import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { importContactsMain } from '../src/main/composition-root.js';
import { importContacts } from '../src/main/features/contacts/index.js';

async function run(text: string) {
  const lines: string[] = [];
  const result = await importContacts('contacts.json', () => Promise.resolve(text), {
    write: (line) => {
      lines.push(line);
    },
  });
  return { result, output: lines.join('') };
}

describe('importContacts', () => {
  it('imports valid records with trimmed names and normalized emails', async () => {
    const { result, output } = await run(
      JSON.stringify([
        { name: '  Ada Lovelace ', email: '  Ada@Example.COM ', phone: '123' },
        { name: 'Grace', email: 'grace@example.com' },
      ]),
    );
    expect(result).toEqual({
      kind: 'imported',
      contacts: [
        { name: 'Ada Lovelace', email: 'ada@example.com' },
        { name: 'Grace', email: 'grace@example.com' },
      ],
      rejected: [],
    });
    expect(output).toBe('Imported 2 contacts\n');
  });

  it('reports an empty list', async () => {
    const { result, output } = await run('[]');
    expect(result).toEqual({ kind: 'imported', contacts: [], rejected: [] });
    expect(output).toBe('Imported 0 contacts\n');
  });

  it('rejects records that are not objects', async () => {
    const { output } = await run('[1, null, "x", [], true]');
    expect(output).toBe(
      [
        'Imported 0 contacts',
        'Rejected #0: not an object',
        'Rejected #1: not an object',
        'Rejected #2: not an object',
        'Rejected #3: not an object',
        'Rejected #4: not an object',
        '',
      ].join('\n'),
    );
  });

  it('rejects a missing, non-string or blank name', async () => {
    const { output } = await run(
      JSON.stringify([
        { email: 'a@example.com' },
        { name: 5, email: 'b@example.com' },
        { name: '   ', email: 'c@example.com' },
      ]),
    );
    expect(output).toBe(
      'Imported 0 contacts\nRejected #0: invalid name\nRejected #1: invalid name\nRejected #2: invalid name\n',
    );
  });

  it('rejects a missing, non-string or malformed email', async () => {
    const { output } = await run(
      JSON.stringify([
        { name: 'A' },
        { name: 'B', email: 7 },
        { name: 'C', email: 'plain' },
        { name: 'D', email: 'd@localhost' },
        { name: 'E', email: '@example.com' },
        { name: 'F', email: 'f@' },
        { name: 'G', email: 'g h@example.com' },
        { name: 'H', email: '   ' },
      ]),
    );
    expect(output).toBe(
      [
        'Imported 0 contacts',
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((index) => `Rejected #${String(index)}: invalid email`),
        '',
      ].join('\n'),
    );
  });

  it('reports the invalid name when both fields are invalid', async () => {
    const { output } = await run(JSON.stringify([{ name: '', email: 'nope' }]));
    expect(output).toBe('Imported 0 contacts\nRejected #0: invalid name\n');
  });

  it('keeps the first record for a repeated email, ignoring case and spacing', async () => {
    const { result, output } = await run(
      JSON.stringify([
        { name: 'First', email: 'x@example.com' },
        { name: 'Bad', email: 'bad' },
        { name: 'Second', email: ' X@EXAMPLE.com ' },
        { name: 'Third', email: 'x@example.com' },
        { name: 'Other', email: 'y@example.com' },
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
        { index: 3, reason: 'duplicate of #0' },
      ],
    });
    expect(output).toBe(
      'Imported 2 contacts\nRejected #1: invalid email\nRejected #2: duplicate of #0\nRejected #3: duplicate of #0\n',
    );
  });

  it('does not let a rejected record claim its email', async () => {
    const { result } = await run(
      JSON.stringify([
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

  it('reports malformed JSON', async () => {
    const { result, output } = await run('[{"name":');
    expect(result).toEqual({ kind: 'malformed-json' });
    expect(output).toBe('Malformed JSON in contacts.json\n');
  });

  it('reports JSON that is not an array', async () => {
    const { result, output } = await run('{"name":"Ada"}');
    expect(result).toEqual({ kind: 'not-an-array' });
    expect(output).toBe('Expected a JSON array in contacts.json\n');
  });

  it('reports a failed read with the error message', async () => {
    const lines: string[] = [];
    const result = await importContacts('missing.json', () => Promise.reject(new Error('boom')), {
      write: (line) => {
        lines.push(line);
      },
    });
    expect(result).toEqual({ kind: 'read-failed', message: 'boom' });
    expect(lines).toEqual(['Could not read missing.json: boom\n']);
  });

  it('reports a rejection that is not an Error by its string form', async () => {
    const readText = vi.fn<(path: string) => Promise<string>>().mockRejectedValue('denied');
    const result = await importContacts('x.json', readText, { write: () => undefined });
    expect(result).toEqual({ kind: 'read-failed', message: 'denied' });
  });

  it('passes the path to the reader', async () => {
    const readText = vi.fn(() => Promise.resolve('[]'));
    await importContacts('some/file.json', readText, { write: () => undefined });
    expect(readText).toHaveBeenCalledWith('some/file.json');
  });
});

describe('importContactsMain', () => {
  it('reads the file and writes the report to standard output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contacts-'));
    const file = join(directory, 'contacts.json');
    await writeFile(file, JSON.stringify([{ name: 'Ada', email: 'ADA@example.com' }, 3]));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await importContactsMain(file);
    expect(write).toHaveBeenCalledWith('Imported 1 contacts\n');
    expect(write).toHaveBeenCalledWith('Rejected #1: not an object\n');
    write.mockRestore();
  });

  it('reports an unreadable file on standard output', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await importContactsMain('/nonexistent/contacts.json');
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Could not read /nonexistent/contacts.json: '),
    );
    write.mockRestore();
  });
});
