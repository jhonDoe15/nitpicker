import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { referencedNames, usesArchive } from './class-references.mjs';
import { classWithStrings, descriptorOfLength } from './test-support/class-bytes.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function directoryWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-class-references-'));
  roots.push(root);
  for (const [file, bytes] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), bytes);
  }
  return root;
}

const LONG_FIELD = descriptorOfLength(69, 'org/acme/widgets');
const WIDGET = `${LONG_FIELD.slice(1, -1)}.class`;

describe('referencedNames', () => {
  it('reads a 69-byte descriptor, whose length byte is the letter E, as its class', () => {
    const classes = directoryWith({ 'demo/A.class': classWithStrings([LONG_FIELD]) });

    expect(classWithStrings([LONG_FIELD]).subarray(10, 13)).toEqual(Buffer.from([1, 0, 0x45]));
    expect(referencedNames([classes]).has(WIDGET)).toBe(true);
  });

  it('reads class names, method descriptors and generic signatures from the constant pool', () => {
    const classes = directoryWith({
      'demo/A.class': classWithStrings([
        'org/acme/Plain',
        '(Lorg/acme/First;I)Lorg/acme/Second;',
        'Ljava/util/List<Lorg/acme/Third;>;',
      ]),
    });

    const names = referencedNames([classes]);

    expect(
      ['Plain', 'First', 'Second', 'Third'].map((name) => names.has(`org/acme/${name}.class`)),
    ).toEqual([true, true, true, true]);
  });

  it('falls back to scanning the bytes of a file that is not a class file', () => {
    const classes = directoryWith({ 'demo/A.class': `\u0001\u0000E${LONG_FIELD}` });

    expect(referencedNames([classes]).has(WIDGET)).toBe(true);
  });
});

describe('usesArchive', () => {
  it('finds a library directory that holds one of the referenced classes', () => {
    const classes = directoryWith({ 'demo/A.class': classWithStrings([LONG_FIELD]) });
    const library = directoryWith({ [WIDGET]: '' });
    const other = directoryWith({ 'org/acme/other/Other.class': '' });
    const names = referencedNames([classes]);

    expect([usesArchive(library, names), usesArchive(other, names)]).toEqual([true, false]);
  });
});
