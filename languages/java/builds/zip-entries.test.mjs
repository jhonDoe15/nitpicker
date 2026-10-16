import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readZip } from './zip-entries.mjs';
import { zipOf } from './test-support/zip-writer.mjs';

const roots = [];
const LAUNCHER = Buffer.from('#!/bin/sh\nexec java -jar "$0"\n');
const DIRECTORY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const MAX_COMMENT = 0xffff;
const MAX_TRAILING = 0x10000;
const SIZED_FILES = {
  'a.txt': 'hi',
  'b.txt': 'stored text that is long enough to differ',
  'c.txt': 'z'.repeat(500),
  'd.txt': 'ok',
};
const LAYOUTS = [
  ['sizes and offsets in the header', {}],
  ['offsets in the zip64 extra', { zip64: true }],
  ['sizes in the zip64 extra', { wideSizes: true }],
  ['sizes and offsets in the zip64 extra', { zip64: true, wideSizes: true }],
];
const FILES = {
  'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nAutomatic-Module-Name: demo.lib\n',
  'demo/lib/Util.class': 'class bytes',
  'demo/lib/deep/Other.class': 'more bytes',
};

function written(buffer) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-zip-'));
  roots.push(root);
  const file = path.join(root, 'lib.jar');
  writeFileSync(file, buffer);
  return file;
}

function directoryOffset(buffer, position) {
  return Array.from({ length: position + 1 }).reduce(
    (offset) => buffer.indexOf(DIRECTORY_SIGNATURE, offset + 1),
    -1,
  );
}

function texts(jar) {
  return Object.fromEntries([...jar.names].map((name) => [name, jar.text(name)]));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readZip', () => {
  it.each([
    ['a plain archive', false],
    ['a zip64 archive', true],
  ])('lists the entries of %s and reads stored and deflated text', (_, zip64) => {
    const jar = readZip(written(zipOf(FILES, { zip64 })));

    expect([...jar.names]).toEqual(Object.keys(FILES));
    expect(jar.text('META-INF/MANIFEST.MF')).toBe(FILES['META-INF/MANIFEST.MF']);
    expect(jar.text('demo/lib/Util.class')).toBe('class bytes');
    expect(jar.text('missing')).toBeUndefined();
  });

  it('reads an archive behind a launcher script', () => {
    const jar = readZip(
      written(Buffer.concat([Buffer.from('#!/bin/sh\nexec java -jar "$0"\n'), zipOf(FILES)])),
    );

    expect([...jar.names]).toEqual(Object.keys(FILES));
    expect(jar.text('demo/lib/Util.class')).toBe('class bytes');
  });

  it('finds the real end record when the archive comment holds its signature', () => {
    const jar = readZip(written(zipOf(FILES, { comment: 'built by PK\u0005\u0006 tools' })));

    expect([...jar.names]).toEqual(Object.keys(FILES));
  });

  it.each(LAYOUTS)('reads every entry with %s', (_, options) => {
    expect(texts(readZip(written(zipOf(SIZED_FILES, options))))).toEqual(SIZED_FILES);
  });

  it.each(LAYOUTS)('reads every entry behind a launcher script with %s', (_, options) => {
    const jar = readZip(written(Buffer.concat([LAUNCHER, zipOf(SIZED_FILES, options)])));

    expect(texts(jar)).toEqual(SIZED_FILES);
  });

  it('finds an end record whose comment fills the whole 64 KiB window', () => {
    const jar = readZip(written(zipOf(FILES, { comment: 'x'.repeat(MAX_COMMENT) })));

    expect(texts(jar)).toEqual(FILES);
  });

  it('rejects a file that is not a zip archive', () => {
    expect(() => readZip(written(Buffer.from('plain text')))).toThrow(
      new Error('not a zip archive: no end of central directory record'),
    );
  });

  it('rejects a long file without an end record', () => {
    expect(() => readZip(written(Buffer.alloc(200, 'x')))).toThrow(
      new Error('not a zip archive: no end of central directory record'),
    );
  });

  it('prefers the exact end record over a fitting fake one inside the comment', () => {
    const comment = `PK\u0005\u0006${'\0'.repeat(18)} and then some more text`;
    const jar = readZip(written(zipOf(FILES, { comment })));

    expect(texts(jar)).toEqual(FILES);
  });

  it.each([
    ['a little zero padding', 16],
    ['zero padding filling the whole window', MAX_COMMENT + MAX_TRAILING],
  ])('reads an archive followed by %s', (_, padding) => {
    const jar = readZip(written(Buffer.concat([zipOf(FILES), Buffer.alloc(padding)])));

    expect(texts(jar)).toEqual(FILES);
  });

  it('rejects an end record further from the end than the comment and padding window', () => {
    const buffer = Buffer.concat([zipOf(FILES), Buffer.alloc(MAX_COMMENT + MAX_TRAILING + 1)]);

    expect(() => readZip(written(buffer))).toThrow(
      new Error('not a zip archive: no end of central directory record'),
    );
  });

  it('rejects a broken central directory signature and names its byte', () => {
    const buffer = zipOf(FILES);
    const broken = directoryOffset(buffer, 1);
    buffer.writeUInt32LE(0, broken);

    expect(() => readZip(written(buffer))).toThrow(
      new Error(`broken zip central directory at byte ${String(broken)}`),
    );
  });

  it('rejects a broken local header only when that entry is read', () => {
    const buffer = zipOf(FILES);
    buffer.writeUInt32LE(0, 0);
    const jar = readZip(written(buffer));

    expect(() => jar.text('META-INF/MANIFEST.MF')).toThrow(
      new Error('broken zip local header for META-INF/MANIFEST.MF'),
    );
    expect(jar.text('demo/lib/Util.class')).toBe('class bytes');
  });

  it('rejects an unknown compression method only when that entry is read', () => {
    const buffer = zipOf(FILES);
    buffer.writeUInt16LE(9, directoryOffset(buffer, 1) + 10);
    const jar = readZip(written(buffer));

    expect(() => jar.text('demo/lib/Util.class')).toThrow(
      new Error('demo/lib/Util.class uses zip compression method 9'),
    );
    expect(jar.text('META-INF/MANIFEST.MF')).toBe(FILES['META-INF/MANIFEST.MF']);
  });
});
