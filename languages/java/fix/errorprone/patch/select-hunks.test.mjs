import { describe, expect, it } from 'vitest';
import { selectHunks } from './select-hunks.mjs';
import { parseUnifiedDiff } from './unified-diff.mjs';

function entry(label, body, header) {
  return { label, hunk: parseUnifiedDiff(`--- a\n+++ a\n${header}\n${body}`)[0].hunks[0] };
}

const BODY = entry(
  'MissingOverride',
  ' a\n-  void run() {}\n+  @Override void run() {}\n b\n',
  '@@ -20,3 +20,3 @@',
);
const FAR = entry(
  'MissingOverride',
  ' a\n-  void far() {}\n+  @Override void far() {}\n b\n',
  '@@ -90,3 +90,3 @@',
);
const IMPORT = entry(
  'UnnecessarilyFullyQualified',
  ' import a.A;\n+import java.util.List;\n+import java.util.Map;\n import b.B;\n',
  '@@ -3,2 +3,4 @@',
);
const USES_LIST = entry(
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

    expect(imports.hunk.lines.filter(({ kind }) => kind === '+').map(({ text }) => text)).toEqual([
      'import java.util.List;',
    ]);
    expect(kept.map(({ hunk }) => hunk.oldStart)).toEqual([3, 40]);
  });

  it('adds no import when nothing that uses it was kept', () => {
    expect(selectHunks([IMPORT, USES_LIST], new Set([3]))).toEqual([]);
  });

  it('keeps an import hunk that removes a line only when that line was touched', () => {
    const replaced = entry(
      'NonCanonicalStaticImport',
      '-import static a.B.c;\n+import static a.C.c;\n',
      '@@ -4,1 +4,1 @@',
    );

    expect(selectHunks([replaced], new Set([4]))).toEqual([replaced]);
    expect(selectHunks([replaced], new Set([9]))).toEqual([]);
  });

  it('keeps an added import that a kept hunk uses when its hunk also removes a line', () => {
    const swap = entry(
      'SpringRestController',
      ' import a.A;\n-import a.Controller;\n+import a.RestController;\n import b.B;\n',
      '@@ -3,3 +3,3 @@',
    );
    const body = entry(
      'SpringRestController',
      '-@Controller class X {}\n+@RestController class X {}\n',
      '@@ -30,1 +30,1 @@',
    );
    const kept = selectHunks([swap, body], new Set([30]));

    expect(kept.map(({ hunk }) => hunk.oldStart)).toEqual([3, 30]);
    expect(kept[0].hunk.lines.map(({ kind, text }) => `${kind}${text}`)).toEqual([
      ' import a.A;',
      ' import a.Controller;',
      '+import a.RestController;',
      ' import b.B;',
    ]);
    expect(selectHunks([swap], new Set([99]))).toEqual([]);
  });
});
