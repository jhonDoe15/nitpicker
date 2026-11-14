import { describe, expect, it } from 'vitest';
import { changedLines, hunkEdit, locateHunk } from './hunk-edits.mjs';
import { parseUnifiedDiff } from './unified-diff.mjs';

function hunkOf(body, header = '@@ -1,1 +1,1 @@') {
  return parseUnifiedDiff(`--- a\n+++ a\n${header}\n${body}`)[0].hunks[0];
}

function applied(text, hunk) {
  const edit = hunkEdit(text, hunk);
  return edit === undefined
    ? undefined
    : `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
}

const SOURCE = 'class A {\n  int a;\n  void run() {}\n  int b;\n}\n';
const OVERRIDE = hunkOf(
  ' class A {\n   int a;\n-  void run() {}\n+  @Override void run() {}\n   int b;\n }\n',
  '@@ -1,5 +1,5 @@',
);

describe('hunkEdit', () => {
  it('replaces only the changed lines, not the context', () => {
    const edit = hunkEdit(SOURCE, OVERRIDE);

    expect(edit.text).toBe('  @Override void run() {}\n');
    expect(SOURCE.slice(edit.start, edit.end)).toBe('  void run() {}\n');
    expect(edit.line).toBe(3);
    expect(applied(SOURCE, OVERRIDE)).toBe(
      'class A {\n  int a;\n  @Override void run() {}\n  int b;\n}\n',
    );
  });

  it('keeps the context lines that sit between two changes of one hunk', () => {
    const source = 'a\nb\nc\nd\ne\n';
    const hunk = hunkOf(' a\n-b\n+B\n c\n-d\n+D\n e\n', '@@ -1,5 +1,5 @@');

    expect(applied(source, hunk)).toBe('a\nB\nc\nD\ne\n');
  });

  it('finds the lines again when the file shifted since the compile', () => {
    const shifted = `// one\n// two\n${SOURCE}`;

    expect(applied(shifted, OVERRIDE)).toBe(
      '// one\n// two\nclass A {\n  int a;\n  @Override void run() {}\n  int b;\n}\n',
    );
    expect(hunkEdit(shifted, OVERRIDE).line).toBe(5);
  });

  it('gives up when the old lines are gone or appear twice', () => {
    expect(
      hunkEdit('class A {\n  int a;\n  void run() { }\n  int b;\n}\n', OVERRIDE),
    ).toBeUndefined();
    expect(hunkEdit(`${SOURCE}${SOURCE}`, OVERRIDE).line).toBe(3);
    const twice = hunkOf('-x\n+y\n', '@@ -9,1 +9,1 @@');

    expect(hunkEdit('x\nx\n', twice)).toBeUndefined();
    expect(locateHunk(['x\n', 'x\n'], twice)).toBeUndefined();
  });

  it('applies a second time only if the old lines are back', () => {
    const once = applied(SOURCE, OVERRIDE);

    expect(hunkEdit(once, OVERRIDE)).toBeUndefined();
  });

  it('deletes lines', () => {
    const hunk = hunkOf(' class A {\n-  int a;\n   void run() {}\n', '@@ -1,3 +1,2 @@');

    expect(applied(SOURCE, hunk)).toBe('class A {\n  void run() {}\n  int b;\n}\n');
  });

  it('inserts lines between two existing lines', () => {
    const hunk = hunkOf(' class A {\n   int a;\n+  int c;\n   void run() {}\n', '@@ -1,3 +1,4 @@');

    expect(applied(SOURCE, hunk)).toBe(
      'class A {\n  int a;\n  int c;\n  void run() {}\n  int b;\n}\n',
    );
  });

  it('inserts into an empty file', () => {
    const hunk = hunkOf('+x\n', '@@ -0,0 +1 @@');

    expect(applied('', hunk)).toBe('x\n');
  });

  it('writes the new lines with the line ending of the file', () => {
    const crlf = SOURCE.replaceAll('\n', '\r\n');

    expect(applied(crlf, OVERRIDE)).toBe(
      'class A {\r\n  int a;\r\n  @Override void run() {}\r\n  int b;\r\n}\r\n',
    );
  });

  it('matches old lines that the patch wrote without their carriage return', () => {
    const crlf = 'a\r\nb\r\nc\r\n';
    const hunk = hunkOf(' a\n-b\n+B\n c\n', '@@ -1,3 +1,3 @@');

    expect(applied(crlf, hunk)).toBe('a\r\nB\r\nc\r\n');
  });

  it('keeps a missing newline at the end of the file', () => {
    const hunk = hunkOf(' a\n-b\n+c\n', '@@ -1,2 +1,2 @@');

    expect(applied('a\nb', hunk)).toBe('a\nc');
  });

  it('uses offsets into the decoded text for multi-byte characters', () => {
    const text = 'ü\n  void run() {}\n';
    const hunk = hunkOf(' ü\n-  void run() {}\n+  @Override void run() {}\n', '@@ -1,2 +1,2 @@');

    expect(hunkEdit(text, hunk).start).toBe('ü\n'.length);
  });
});

describe('changedLines', () => {
  it('lists the removed lines by their old line numbers', () => {
    expect(changedLines(OVERRIDE)).toEqual([3]);
  });

  it('lists the two lines around an insertion', () => {
    const hunk = hunkOf(' a\n+x\n b\n', '@@ -5,2 +5,3 @@');

    expect(changedLines(hunk)).toEqual([5, 6]);
  });

  it('numbers removed lines past the context that sits between them', () => {
    const hunk = hunkOf('-a\n b\n-c\n', '@@ -7,3 +7,1 @@');

    expect(changedLines(hunk)).toEqual([7, 9]);
  });
});
