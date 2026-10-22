import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceReader } from './source-text.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportRootWith(argumentFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-source-text-'));
  roots.push(root);
  mkdirSync(path.join(root, 'errorprone'));
  for (const [name, lines] of Object.entries(argumentFiles)) {
    writeFileSync(path.join(root, 'errorprone', name), lines.map((line) => `${line}\n`).join(''));
  }
  return root;
}

describe('sourceReader', () => {
  it('decodes each source with the encoding its compile used, so offsets match javac', () => {
    const root = reportRootWith({});
    const latin = path.join(root, 'Latin.java');
    const plain = path.join(root, 'Plain.java');
    writeFileSync(latin, Buffer.from([0x2f, 0x2f, 0xc3, 0xa9, 0x0a, 0x40]));
    writeFileSync(plain, '﻿// é\n@');
    writeFileSync(
      path.join(root, 'errorprone/main.args'),
      ['-d', 'x', '-encoding', 'ISO-8859-1', '--sources', latin, ''].join('\n'),
    );
    writeFileSync(
      path.join(root, 'errorprone/test.args'),
      ['-d', 'y', '--sources', plain, ''].join('\n'),
    );
    const read = sourceReader(root);

    expect([read(latin), read(plain), read(path.join(root, 'Missing.java'))]).toStrictEqual([
      '//Ã©\n@',
      '﻿// é\n@',
      '',
    ]);
  });

  it('accepts Java charset names that are not WHATWG labels, one character per byte', () => {
    const root = reportRootWith({});
    const file = path.join(root, 'A.java');
    writeFileSync(file, Buffer.from([0xc3, 0xa9, 0x41]));
    writeFileSync(
      path.join(root, 'errorprone/main.args'),
      ['-encoding', 'Cp1252', '--sources', file, ''].join('\n'),
    );

    expect(sourceReader(root)(file).indexOf('A')).toBe(2);
  });
});
