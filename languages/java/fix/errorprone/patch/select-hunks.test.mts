import { describe, expect, it } from 'vitest';
import { selectHunks } from './select-hunks.mts';
import { labeledHunk } from './test-support/labeled-hunks.mts';
import type { LabeledHunk } from './select-hunks.mts';

const BODY = labeledHunk(
  'MissingOverride',
  ' a\n-  void run() {}\n+  @Override void run() {}\n b\n',
  '@@ -20,3 +20,3 @@',
);
const FAR = labeledHunk(
  'MissingOverride',
  ' a\n-  void far() {}\n+  @Override void far() {}\n b\n',
  '@@ -90,3 +90,3 @@',
);
const IMPORT = labeledHunk(
  'UnnecessarilyFullyQualified',
  ' import a.A;\n+import java.util.List;\n+import java.util.Map;\n import b.B;\n',
  '@@ -3,2 +3,4 @@',
);
const USES_LIST = labeledHunk(
  'UnnecessarilyFullyQualified',
  '-  java.util.List<String> names;\n+  List<String> names;\n',
  '@@ -40,1 +40,1 @@',
);

describe('selectHunks', () => {
  it('keeps a hunk that touches a changed line and drops one that does not', () => {
    const kept = selectHunks([BODY, FAR], new Set([21]));

    expect(kept).toEqual([BODY]);
  });

  it('keeps every hunk when all lines count', () => {
    expect(selectHunks([BODY, FAR, IMPORT], 'all')).toHaveLength(3);
  });

  it('keeps nothing when no line was touched', () => {
    expect(selectHunks([BODY, FAR], new Set())).toEqual([]);
  });

  it('adds only the imports that a kept hunk now uses', () => {
    const kept = selectHunks([IMPORT, USES_LIST], new Set([40]));
    const imports = kept.find(({ hunk }) => hunk.lines.some(({ text }) => text.includes('import')));

    expect(imports?.hunk.lines.filter(({ kind }) => kind === '+').map(({ text }) => text)).toEqual([
      'import java.util.List;',
    ]);
    expect(kept.map(({ hunk }) => hunk.oldStart)).toEqual([3, 40]);
  });

  it('adds no import when nothing that uses it was kept', () => {
    expect(selectHunks([IMPORT, USES_LIST], new Set([3]))).toEqual([]);
  });

  it('keeps an import hunk that removes a line only when that line was touched', () => {
    const replaced = labeledHunk(
      'NonCanonicalStaticImport',
      '-import static a.B.c;\n+import static a.C.c;\n',
      '@@ -4,1 +4,1 @@',
    );

    expect(selectHunks([replaced], new Set([4]))).toEqual([replaced]);
    expect(selectHunks([replaced], new Set([9]))).toEqual([]);
  });

  it('keeps an added import that a kept hunk uses when its hunk also removes a line', () => {
    const swap = labeledHunk(
      'SpringRestController',
      ' import a.A;\n-import a.Controller;\n+import a.RestController;\n import b.B;\n',
      '@@ -3,3 +3,3 @@',
    );
    const body = labeledHunk(
      'SpringRestController',
      '-@Controller class X {}\n+@RestController class X {}\n',
      '@@ -30,1 +30,1 @@',
    );
    const kept = selectHunks([swap, body], new Set([30]));

    expect(kept.map(({ hunk }) => hunk.oldStart)).toEqual([3, 30]);
    expect(kept[0]?.hunk.lines.map(({ kind, text }) => `${kind}${text}`)).toEqual([
      ' import a.A;',
      ' import a.Controller;',
      '+import a.RestController;',
      ' import b.B;',
    ]);
    expect(selectHunks([swap], new Set([99]))).toEqual([]);
  });
});

describe('selectHunks imports', () => {
  const removal = labeledHunk(
    'UseEnumCollections',
    ' import a.A;\n-import java.util.HashSet;\n+import java.util.EnumSet;\n import b.B;\n',
    '@@ -3,3 +3,3 @@',
  );
  const body = labeledHunk(
    'UseEnumCollections',
    '-    Set<C> s = new HashSet<>();\n+    Set<C> s = EnumSet.noneOf(C.class);\n',
    '@@ -9,1 +9,1 @@',
  );
  const file = (rest: string): string =>
    `package p;\n\nimport a.A;\nimport java.util.HashSet;\nimport b.B;\nclass X {\n  void f() {\n${rest}\n    Set<C> s = new HashSet<>();\n  }\n}\n`;

  it('removes an import the kept hunks leave unnamed in the file', () => {
    const kept = selectHunks([removal, body], new Set([9]), file('    A.run();'));

    expect(kept[0]?.hunk.lines.map(({ kind, text }) => `${kind}${text}`)).toEqual([
      ' import a.A;',
      '-import java.util.HashSet;',
      '+import java.util.EnumSet;',
      ' import b.B;',
    ]);
  });

  it('keeps an import that other code of the file still names', () => {
    const kept = selectHunks([removal, body], new Set([9]), file('    new HashSet<>();'));

    expect(kept[0]?.hunk.lines.map(({ kind, text }) => `${kind}${text}`)).toEqual([
      ' import a.A;',
      ' import java.util.HashSet;',
      '+import java.util.EnumSet;',
      ' import b.B;',
    ]);
  });
});

describe('selectHunks touched import removals', () => {
  const removal = labeledHunk(
    'UnnecessarilyFullyQualified',
    ' package p;\n-import java.util.List;\n class X {\n',
    '@@ -1,3 +1,2 @@',
  );
  const body = labeledHunk(
    'UnnecessarilyFullyQualified',
    '-  List<String> l = a;\n+  var l = a;\n',
    '@@ -20,1 +20,1 @@',
  );
  const file = `package p;\nimport java.util.List;\nclass X {\n${'\n'.repeat(16)}  List<String> l = a;\n}\n`;

  it('keeps the removal of an import the file no longer names', () => {
    expect(selectHunks([removal, body], new Set([2, 20]), file)).toHaveLength(2);
  });

  it('drops the removal of an import the file still names', () => {
    expect(selectHunks([removal, body], new Set([2]), file)).toEqual([]);
  });
});

describe('selectHunks groups', () => {
  const grouped = (start: number, group: string): LabeledHunk => ({
    ...labeledHunk(
      'SaveInLoop',
      ' a\n-  x();\n+  y();\n b\n',
      `@@ -${String(start)},3 +${String(start)},3 @@`,
    ),
    group,
  });
  const before = grouped(10, 'SaveInLoop:11');
  const inside = grouped(20, 'SaveInLoop:11');
  const after = grouped(40, 'SaveInLoop:11');
  const other = grouped(60, 'SaveInLoop:61');

  it('keeps every hunk of a fix when one of them touches a changed line', () => {
    expect(selectHunks([before, inside, after, other], new Set([21]))).toEqual([
      before,
      inside,
      after,
    ]);
  });

  it('drops every hunk of a fix when none of them touches a changed line', () => {
    expect(selectHunks([before, inside, after, other], new Set([61]))).toEqual([other]);
    expect(selectHunks([before, inside, after], new Set([30]))).toEqual([]);
  });
});
