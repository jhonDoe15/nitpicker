import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zipEntryOf } from './zip-entry.mts';
import { zipOf } from '../test-support/archives/zip-writer.mts';

const roots: string[] = [];
const LAUNCHER = Buffer.from('#!/bin/sh\nexec java -jar "$0"\n');
const WINDOW = 0xffff + 0x10000 + 22;
const FILES = {
  'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n',
  'demo/lib/Util.class': 'class bytes',
  'demo/lib/long.txt': 'z'.repeat(500),
};
const LAYOUTS: readonly (readonly [string, Parameters<typeof zipOf>[1]])[] = [
  ['sizes and offsets in the header', {}],
  ['offsets in the zip64 extra', { zip64: true }],
  ['sizes in the zip64 extra', { wideSizes: true }],
  ['a comment', { comment: 'built by tools' }],
];

function written(buffer: Buffer): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-zip-entry-'));
  roots.push(root);
  const file = path.join(root, 'lib.jar');
  writeFileSync(file, buffer);
  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('zipEntryOf', () => {
  it.each(LAYOUTS)('reads one entry of an archive with %s', (_, layout) => {
    const file = written(zipOf(FILES, layout));

    expect(zipEntryOf(file, 'demo/lib/long.txt')).toBe(FILES['demo/lib/long.txt']);
    expect(zipEntryOf(file, 'demo/lib/Util.class')).toBe('class bytes');
    expect(zipEntryOf(file, 'missing')).toBeUndefined();
  });

  it('reads an entry behind a launcher script', () => {
    const file = written(Buffer.concat([LAUNCHER, zipOf(FILES)]));

    expect(zipEntryOf(file, 'META-INF/MANIFEST.MF')).toBe(FILES['META-INF/MANIFEST.MF']);
  });

  it('reads a central directory that starts before the end window', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 3000 }, (_, index) => [
        `demo/lib/deep/name/Class${String(index)}.class`,
        'x',
      ]),
    );
    const file = written(zipOf({ 'big.bin': 'b'.repeat(WINDOW), ...entries, 'last.txt': 'end' }));

    expect(zipEntryOf(file, 'last.txt')).toBe('end');
    expect(zipEntryOf(file, 'big.bin')).toHaveLength(WINDOW);
  });

  it('rejects a file that is not a zip archive', () => {
    expect(() => zipEntryOf(written(Buffer.from('plain text')), 'a')).toThrow(
      new Error('not a zip archive: no end of central directory record'),
    );
  });

  it('finds no entry in an empty archive', () => {
    expect(zipEntryOf(written(zipOf({})), 'a')).toBeUndefined();
  });

  it('rejects an entry whose header lies past the end of the file', () => {
    const buffer = zipOf({ 'a.txt': 'text' });
    const record = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buffer.writeUInt32LE(buffer.length + 100, record + 42);

    expect(() => zipEntryOf(written(buffer), 'a.txt')).toThrow(/zip archive ends before byte/u);
  });
});
