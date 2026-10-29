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
      '--- file.json\n+++ file.json (nitpicker init)\n@@ -0,0 +1,1 @@\n+a\n',
    );
  });

  it('shows two equal files as no hunks', () => {
    expect(diff('a\n', 'a\n')).toBe('--- file.json\n+++ file.json (nitpicker init)\n');
  });

  it('keeps three lines of context around each change, in hunks of their own', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line ${String(index + 1)}`);
    const before = `${lines.join('\n')}\n`;
    const after = before.replace('line 3\n', 'line three\n').replace('line 18\n', '');

    expect(diff(before, after)).toBe(
      [
        '--- file.json',
        '+++ file.json (nitpicker init)',
        '@@ -1,6 +1,6 @@',
        ' line 1',
        ' line 2',
        '-line 3',
        '+line three',
        ' line 4',
        ' line 5',
        ' line 6',
        '@@ -15,6 +15,5 @@',
        ' line 15',
        ' line 16',
        ' line 17',
        '-line 18',
        ' line 19',
        ' line 20',
        '',
      ].join('\n'),
    );
  });

  it('falls back to a full replacement for files too large to compare', () => {
    const before = Array.from({ length: 2500 }, (_, index) => `old ${String(index)}`).join('\n');
    const after = Array.from({ length: 2500 }, (_, index) => `new ${String(index)}`).join('\n');
    const lines = diff(before, after).split('\n');

    expect(lines.filter((line) => line.startsWith('-old')).length).toBe(2500);
    expect(lines.filter((line) => line.startsWith('+new')).length).toBe(2500);
  });
});
