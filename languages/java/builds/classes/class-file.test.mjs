import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classFiles, constantPoolStrings } from './class-file.mjs';
import { classWithStrings } from './test-support/class-bytes.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('constantPoolStrings', () => {
  it('returns the Utf8 constants, decoding modified UTF-8', () => {
    expect(constantPoolStrings(classWithStrings(['demo/Café', 'Ljava/lang/String;']))).toEqual([
      'demo/Café',
      'Ljava/lang/String;',
    ]);
  });

  it('skips the second slot of a long constant', () => {
    const header = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x41, 0, 4]);
    const longConstant = Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 7]);
    const utf8 = Buffer.concat([Buffer.from([1, 0, 6]), Buffer.from('demo/A')]);

    expect(constantPoolStrings(Buffer.concat([header, longConstant, utf8]))).toEqual(['demo/A']);
  });

  it('throws on a truncated constant pool', () => {
    expect(() => constantPoolStrings(classWithStrings(['demo/A']).subarray(0, 12))).toThrow(
      RangeError,
    );
  });
});

describe('classFiles', () => {
  it('lists the class files under a directory, sorted, and nothing for a missing one', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-class-file-'));
    roots.push(root);
    for (const file of ['b/B.class', 'a/A.class', 'a/notes.txt']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), '');
    }

    expect(classFiles(root).map((file) => path.relative(root, file))).toEqual([
      path.join('a', 'A.class'),
      path.join('b', 'B.class'),
    ]);
    expect(classFiles(path.join(root, 'missing'))).toEqual([]);
  });
});
