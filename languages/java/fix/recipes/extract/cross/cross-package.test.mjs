import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { filesOf } from '../test-support/cross-sources.mjs';

const FOLDER = 'src/main/java/demo';
const roots = [];

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cross-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function outcome(files, root = '/nonexistent') {
  const { fixes, notes } = recipe.plan({ files, projectRoot: root });
  return { fixes, reasons: notes.map((note) => note.split('near-duplicate: ').at(-1)) };
}

function moved(files, folder) {
  return files.map((file) => ({
    ...file,
    path: path.posix.join(folder, path.posix.basename(file.path)),
  }));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('javaExtractNearDuplicateRecipe across two files and the package around them', () => {
  it('declines a type that is nested in the second class and a package class in the first', () => {
    const use = { call: 'format.setTimeZone(zone); Node held = null;' };
    const files = filesOf(use, { ...use, extra: '    private static final class Node {}\n' });
    const node = { path: `${FOLDER}/Node.java`, text: 'package demo;\n\nclass Node {}\n' };
    expect(outcome([...files, node])).toEqual({
      fixes: [],
      reasons: ['a copy uses a type nested in its class, which the shared class cannot name'],
    });
  });

  it('declines a name that two files resolve to different types', () => {
    expect(outcome(filesOf({}, { date: 'java.sql.Date' }))).toEqual({
      fixes: [],
      reasons: ['the name Date means a different type in each file'],
    });
  });

  it('declines a field type that two files resolve to different types', () => {
    const field = { extra: '    private final Date when = null;\n', call: 'when.getTime();' };
    expect(outcome(filesOf(field, { ...field, date: 'java.sql.Date' })).reasons).toEqual([
      'the name Date means a different type in each file',
    ]);
  });

  it('writes the shared class beside two copies in the project root folder', () => {
    const { fixes, reasons } = outcome(moved(filesOf(), ''), projectWith({}));
    const written = fixes.flatMap((fix) => fix.edits).filter(({ type }) => type === 'write');
    expect([reasons, written.map(({ path: name }) => name)]).toEqual([[], ['SqlAdapters.java']]);
  });

  it('declines a class name that a Kotlin file of the package already uses', () => {
    const root = projectWith({
      'src/main/kotlin/demo/SqlAdapters.kt': 'package demo\n\nobject SqlAdapters\n',
    });
    expect(outcome(filesOf(), root)).toEqual({
      fixes: [],
      reasons: ['a file named SqlAdapters already exists in the package'],
    });
  });

  it('declines a class name that a file of the package mentions', () => {
    const root = projectWith({
      'src/main/java/demo/Other.java': 'package demo;\n\nclass Other { SqlAdapters used; }\n',
    });
    expect(outcome(filesOf(), root).reasons).toEqual([
      'the name SqlAdapters is used in the package',
    ]);
  });

  it.each(['build/generated/demo', 'target/demo', 'app/generated/demo'])(
    'leaves sources under %s alone',
    (folder) => {
      expect(outcome(moved(filesOf(), folder))).toEqual({ fixes: [], reasons: [] });
    },
  );

  it('declines copies whose classes suppress different warnings', () => {
    expect(outcome(filesOf({}, { suppress: '@SuppressWarnings("rawtypes")' })).reasons).toEqual([
      'the copies carry different @SuppressWarnings annotations',
    ]);
  });
});
