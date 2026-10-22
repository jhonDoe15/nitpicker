import { describe, expect, it } from 'vitest';
import { unifiedDiff } from './line-diff.mjs';

const diff = (before, after) => unifiedDiff({ name: 'file.json', before, after });

describe('unified diff', () => {
  it('shows an added line between unchanged ones', () => {
    expect(diff('{\n  "a": 1\n}\n', '{\n  "preset": "java",\n  "a": 1\n}\n')).toBe(
      [
        '--- file.json',
        '+++ file.json (nitpicker init)',
        '@@ -1,3 +1,4 @@',
        ' {',
        '+  "preset": "java",',
        '   "a": 1',
        ' }',
        '',
      ].join('\n'),
    );
  });

  it('shows a changed line as a removal and an addition', () => {
    expect(diff('{ "preset": "typescript" }\n', '{ "preset": "javascript" }\n')).toBe(
      [
        '--- file.json',
        '+++ file.json (nitpicker init)',
        '@@ -1,1 +1,1 @@',
        '-{ "preset": "typescript" }',
        '+{ "preset": "javascript" }',
        '',
      ].join('\n'),
    );
  });

  it('shows trailing removals and additions', () => {
    const head = '--- file.json\n+++ file.json (nitpicker init)\n';

    expect(diff('a\nb\nc\n', 'a\n')).toBe(`${head}@@ -1,3 +1,1 @@\n a\n-b\n-c\n`);
    expect(diff('a\n', 'a\nb\nc\n')).toBe(`${head}@@ -1,1 +1,3 @@\n a\n+b\n+c\n`);
  });

  it('shows an empty file as all additions', () => {
    expect(diff('', 'a\n')).toBe(
      '--- file.json\n+++ file.json (nitpicker init)\n@@ -1,0 +1,1 @@\n+a\n',
    );
  });

  it('shows two empty files as no operations', () => {
    expect(diff('', '')).toBe('--- file.json\n+++ file.json (nitpicker init)\n@@ -1,0 +1,0 @@\n\n');
  });

  it('falls back to a full replacement for files too large to compare', () => {
    const before = Array.from({ length: 2500 }, (_, index) => `old ${String(index)}`).join('\n');
    const after = Array.from({ length: 2500 }, (_, index) => `new ${String(index)}`).join('\n');
    const lines = diff(before, after).split('\n');

    expect(lines.filter((line) => line.startsWith('-old')).length).toBe(2500);
    expect(lines.filter((line) => line.startsWith('+new')).length).toBe(2500);
  });
});
