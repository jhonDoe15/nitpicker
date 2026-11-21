import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compactJsonLines, prettyJsonPieces, writePieces } from './json-pieces.mts';
import { parseJsonDescriptor } from './json-lines.mts';

const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-json-pieces-'));

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function finding(index: number): Record<string, unknown> {
  return {
    tool: 'eslint-lint',
    rule: 'no-unsafe-call',
    path: `src/ä/${String(index)}.ts`,
    message: `Unsafe call ${String(index)}: "quoted", line\nbreak, emoji 😀 and  `,
    location: { line: index, column: 1 },
    exception: { paths: [`src/${String(index)}.ts`] },
    skipped: undefined,
  };
}

const findings = Array.from({ length: 600 }, (_, index) => finding(index));

const VALUES: readonly (readonly [string, unknown])[] = [
  ['a report with many findings', { findings, moduleImports: { a: ['b'] }, empty: [], none: {} }],
  ['nested reports', { reports: [['eslint-lint', { findings }], ['structure', { findings: [] }]] }],
  ['an array of reports', [{ findings }, undefined, null, 3, 'text']],
  ['a small value', { findings: [finding(1)], note: 'kept on one line' }],
  ['a scalar', 'plain'],
  ['an object with odd keys', { ['__proto__']: { findings }, 'a:': findings, 'b"': 1 }],
];

function joined(pieces: Iterable<string>): string {
  const parts: string[] = [];
  writePieces(pieces, (text) => {
    parts.push(text);
  });
  return parts.join('');
}

function parsedFromFile(name: string, text: string, fallback = true): unknown {
  const file = path.join(directory, name);
  writeFileSync(file, text);
  const descriptor = openSync(file, 'r');
  try {
    return parseJsonDescriptor(descriptor, () => {
      if (!fallback) {
        throw new Error('read the whole text');
      }
      return text;
    });
  } finally {
    closeSync(descriptor);
  }
}

describe('JSON written in pieces', () => {
  it.each(VALUES)('prints %s exactly as JSON.stringify with two spaces', (_, value) => {
    expect(joined(prettyJsonPieces(value))).toBe(JSON.stringify(value, null, 2));
  });

  it.each(VALUES)('writes %s as compact lines that parse back to the same value', (name, value) => {
    const text = `${joined(compactJsonLines(value))}\n`;
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
    expect(parsedFromFile(`${name}.json`, text, false)).toEqual(JSON.parse(JSON.stringify(value)));
  });

  it('puts each element of a large list on its own line', () => {
    const lines = joined(compactJsonLines({ findings })).split('\n');
    expect(lines.slice(0, 3)).toEqual([
      '{',
      '"findings":',
      '[',
    ]);
    expect(lines).toHaveLength(findings.length + 5);
  });
});

describe('JSON read line by line', () => {
  it('reads one-line documents and pretty-printed documents', () => {
    const value = { findings, summary: { total: 600 } };
    expect(parsedFromFile('one-line.json', `${JSON.stringify(value)}\n`)).toEqual(
      JSON.parse(JSON.stringify(value)),
    );
    expect(parsedFromFile('pretty.json', JSON.stringify(value, null, 2))).toEqual(
      JSON.parse(JSON.stringify(value)),
    );
  });

  it('reads lines and characters cut across read chunks', () => {
    const value = { findings: Array.from({ length: 12_000 }, (_, index) => finding(index)) };
    const text = `${joined(compactJsonLines(value))}\n`;
    expect(Buffer.byteLength(text)).toBeGreaterThan(2 * 1024 * 1024);
    expect(parsedFromFile('chunks.json', text, false)).toEqual(JSON.parse(text));
  });

  it('keeps a member named __proto__ as data', () => {
    const parsed = parsedFromFile('proto.json', `${joined(compactJsonLines(VALUES[5]?.[1]))}\n`);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.keys(parsed ?? {})).toEqual(['__proto__', 'a:', 'b"']);
  });

  it('rejects cut output like JSON.parse does', () => {
    const text = joined(compactJsonLines({ findings })).slice(0, 5000);
    expect(() => parsedFromFile('cut.json', text)).toThrow(SyntaxError);
    expect(() => parsedFromFile('empty.json', '')).toThrow(SyntaxError);
  });
});
