import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './unified-diff.mjs';

function headerOf(hunk) {
  const { oldStart, oldCount, newStart, newCount } = hunk;
  return { oldStart, oldCount, newStart, newCount };
}

const SIMPLE = `--- ../src/A.java
+++ ../src/A.java
@@ -4,5 +4,5 @@
   private int unused = 3;
 
-  class Inner {
+  static class Inner {
     int one() {
       return 1;
`;

describe('parseUnifiedDiff', () => {
  it('reads the paths and the lines of a hunk', () => {
    const [file] = parseUnifiedDiff(SIMPLE);

    expect(file.oldPath).toBe('../src/A.java');
    expect(file.newPath).toBe('../src/A.java');
    expect(file.hunks).toHaveLength(1);
    expect(headerOf(file.hunks[0])).toEqual({ oldStart: 4, oldCount: 5, newStart: 4, newCount: 5 });
    expect(file.hunks[0].lines.map(({ kind }) => kind).join('')).toBe('  -+  ');
  });

  it('keeps the kind and the text of each line', () => {
    const [{ hunks }] = parseUnifiedDiff(SIMPLE);

    expect(hunks[0].lines[2]).toEqual({ kind: '-', text: '  class Inner {' });
    expect(hunks[0].lines[3]).toEqual({ kind: '+', text: '  static class Inner {' });
    expect(hunks[0].lines[1]).toEqual({ kind: ' ', text: '' });
  });

  it('reads several files and several hunks', () => {
    const text = `${SIMPLE}@@ -20,3 +20,3 @@
 a
-b
+c
 d
--- /x/B.java\t2024-01-01 00:00:00
+++ /x/B.java\t2024-01-01 00:00:01
@@ -1 +1 @@
-old
+new
`;
    const files = parseUnifiedDiff(text);

    expect(files.map(({ newPath }) => newPath)).toEqual(['../src/A.java', '/x/B.java']);
    expect(files[0].hunks).toHaveLength(2);
    expect(headerOf(files[1].hunks[0])).toEqual({
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
    });
  });

  it('treats a missing count as one line', () => {
    const [{ hunks }] = parseUnifiedDiff('--- a\n+++ a\n@@ -3 +3 @@\n-x\n+y\n');

    expect([hunks[0].oldCount, hunks[0].newCount]).toEqual([1, 1]);
  });

  it('keeps removed and added lines that look like file headers', () => {
    const text = '--- a\n+++ a\n@@ -1,2 +1,2 @@\n--- not a header\n+++ nor this\n context\n';
    const [{ hunks }] = parseUnifiedDiff(text);

    expect(hunks[0].lines[0]).toEqual({ kind: '-', text: '-- not a header' });
    expect(hunks[0].lines[1]).toEqual({ kind: '+', text: '++ nor this' });
  });

  it('marks a line that has no newline at the end of the file', () => {
    const text = '--- a\n+++ a\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n';
    const [{ hunks }] = parseUnifiedDiff(text);

    expect(hunks[0].lines[0].noNewline).toBe(true);
    expect(hunks[0].lines[1].noNewline).toBeUndefined();
  });

  it('reports a created or a deleted file with no path on that side', () => {
    const created = parseUnifiedDiff('--- /dev/null\n+++ b/N.java\n@@ -0,0 +1 @@\n+x\n');
    const deleted = parseUnifiedDiff('--- a/D.java\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n');

    expect(created[0].oldPath).toBeUndefined();
    expect(created[0].newPath).toBe('b/N.java');
    expect(deleted[0].newPath).toBeUndefined();
  });

  it('keeps carriage returns in line text', () => {
    const [{ hunks }] = parseUnifiedDiff('--- a\n+++ a\n@@ -1 +1 @@\n-x\r\n+y\r\n');

    expect(hunks[0].lines.map(({ text }) => text)).toEqual(['x\r', 'y\r']);
  });

  it('reads an empty context line written without its space', () => {
    const [{ hunks }] = parseUnifiedDiff('--- a\n+++ a\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n');

    expect(hunks[0].lines.map(({ kind }) => kind)).toEqual([' ', ' ', '-', '+']);
  });

  it('ignores text around the files and returns nothing for an empty patch', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('diff --git a b\nindex 1..2\n')).toEqual([]);
  });

  it('rejects a hunk whose line counts do not match its header', () => {
    expect(() => parseUnifiedDiff('--- a\n+++ a\n@@ -1,3 +1,3 @@\n a\n-b\n+c\n')).toThrow(
      /lists 2 old and 2 new lines, not 3 and 3/u,
    );
  });
});
