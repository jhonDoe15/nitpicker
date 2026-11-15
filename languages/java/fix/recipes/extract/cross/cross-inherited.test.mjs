import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { family, twoClasses } from '../test-support/cross-sources.mjs';

const roots = [];
const INHERITED =
  'a copy uses a type that a supertype of its class declares as a member, which the shared class does not inherit';
const UNKNOWN =
  'a supertype of a copy is not in the project, so it may declare a member type the shared class does not inherit';
const CLASSES = 'the pairs of the two files are in different classes';

function supertype(name, body, extending = '') {
  return {
    path: `src/main/java/demo/${name}.java`,
    text: `package demo;\n\n${body}\n`.replace('NAME', name + extending),
  };
}

function outcome(files, root = '/nonexistent') {
  const { fixes, notes } = recipe.plan({ files, projectRoot: root });
  return [fixes.length, notes.map((note) => note.split('near-duplicate: ').at(-1))];
}

const NESTED = 'class NAME {\n    static class ArrayList<T> extends java.util.ArrayList<T> {}\n}';
const PLAIN = 'class NAME {\n    static class Unused {}\n}';

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('javaExtractNearDuplicateRecipe with copies that inherit member types', () => {
  const copies = family('OrderReader', 'OrderWriter', { ext: ' extends Base' });

  it('declines a type that a superclass declares as a member', () => {
    expect(outcome([supertype('Base', NESTED), ...copies])).toEqual([0, [INHERITED]]);
  });

  it('extracts when no member of the superclass has the name of a type of the code', () => {
    expect(outcome([supertype('Base', PLAIN), ...copies])).toEqual([1, []]);
  });

  it('follows the superclass of a superclass', () => {
    const files = [
      supertype('Base', 'class NAME extends Root {}'),
      supertype('Root', NESTED),
      ...copies,
    ];
    expect(outcome(files)).toEqual([0, [INHERITED]]);
  });

  it('follows an interface', () => {
    const iface = 'interface NAME {\n    class ArrayList<T> extends java.util.ArrayList<T> {}\n}';
    const files = family('OrderReader', 'OrderWriter', { ext: ' implements Base' });
    expect(outcome([supertype('Base', iface), ...files])).toEqual([0, [INHERITED]]);
  });

  it('declines a superclass whose source is not in the project', () => {
    expect(outcome(copies)).toEqual([0, [UNKNOWN]]);
  });

  it('reads a superclass from the files of the project on disk', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-inherit-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/demo/Base.java'), supertype('Base', NESTED).text);
    expect(outcome(copies, root)).toEqual([0, [INHERITED]]);
  });
});

describe('javaExtractNearDuplicateRecipe with pairs in different classes', () => {
  it('declines when the pairs of two files sit in different classes', () => {
    expect(outcome(twoClasses())).toEqual([0, [CLASSES, CLASSES]]);
  });
});
