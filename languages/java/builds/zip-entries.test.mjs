import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readZip } from './zip-entries.mjs';
import { zipOf } from './test-support/zip-writer.mjs';

const roots = [];
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

  it('rejects a file that is not a zip archive', () => {
    expect(() => readZip(written(Buffer.from('plain text')))).toThrow(
      new Error('not a zip archive: no end of central directory record'),
    );
  });
});
