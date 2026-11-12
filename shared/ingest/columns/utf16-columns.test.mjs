import { describe, expect, it } from 'vitest';
import { utf16Column, withUtf16Columns } from './utf16-columns.mjs';

const PYTHON_LINE = 's = "é😀"; x = undefined_name';
const JAVA_LINE = '\tint 😀 = 1;\tint x = 2;';
const CHECKSTYLE_LINES = [
  ['\timport java.util.*;', '.*', 25, 21],
  ['/* é😀 */\timport java.io.*;', '.*', 30, 26],
  ['  void g(int a) { String s = "😀😀"; g( 1); }', '( 1', 37, 37],
  ['\tvoid h(int a) { String s = "😀😀"; h( 1); }', '( 1', 43, 39],
];

function finding(tool, line, column) {
  return { tool, rule: 'r', path: 'src/a.py', location: { line, column } };
}

describe('utf16Column', () => {
  it('converts the code-point column ruff prints for a name after non-ASCII text', () => {
    expect(PYTHON_LINE.indexOf('undefined_name') + 1).toBe(16);
    expect(utf16Column(PYTHON_LINE, 15, 'code-points')).toBe(16);
  });
  it('keeps a mypy column only on an ASCII line, since mypy versions count differently', () => {
    expect(utf16Column(PYTHON_LINE, 19, 'ascii-only')).toBeUndefined();
    expect(utf16Column('x: int = undefined_name', 10, 'ascii-only')).toBe(10);
  });
  it('undoes the tab stops of javac, which counts a surrogate pair as two', () => {
    expect(utf16Column(JAVA_LINE, 9, 'tab-stops')).toBe(2);
    expect(utf16Column(JAVA_LINE, 13, 'tab-stops')).toBe(6);
    expect(utf16Column(JAVA_LINE, 29, 'tab-stops')).toBe(JAVA_LINE.indexOf('x') + 1);
  });
  it('undoes the columns real Checkstyle 10.21.1 printed, tab stops of 8 and of 4', () => {
    const expected = CHECKSTYLE_LINES.map(([text, target]) => text.indexOf(target) + 1);

    expect(
      CHECKSTYLE_LINES.map(([text, , eight]) => utf16Column(text, eight, 'checkstyle-tab-stops')),
    ).toEqual(expected);
    expect(
      CHECKSTYLE_LINES.map(([text, , , four]) =>
        utf16Column(text, four, { unit: 'checkstyle-tab-stops', tabWidth: 4 }),
      ),
    ).toEqual(expected);
  });
  it('keeps the column of an ASCII line and continues past the end of the line', () => {
    expect(utf16Column('x = 1', 3, 'code-points')).toBe(3);
    expect(utf16Column('😀', 3, 'code-points')).toBe(4);
  });
});

describe('withUtf16Columns', () => {
  const sources = { 'src/a.py': `first\r\n${PYTHON_LINE}\n` };
  const readSource = (file) => sources[file];

  it('converts the columns of the listed tools from the source line', () => {
    const converted = withUtf16Columns(
      [finding('ruff', 2, 15), finding('mypy', 2, 19), finding('pyright', 2, 16)],
      { units: { ruff: 'code-points', mypy: 'ascii-only' }, readSource },
    );

    expect(converted.map(({ location }) => location)).toEqual([
      { line: 2, column: 16 },
      { line: 2 },
      { line: 2, column: 16 },
    ]);
  });
  it('drops a mypy column it cannot check and skips a byte order mark', () => {
    const converted = withUtf16Columns(
      [finding('mypy', 9, 3), { ...finding('ruff', 1, 4), path: 'src/bom.py' }],
      {
        units: { ruff: 'code-points', mypy: 'ascii-only' },
        readSource: (file) => (file === 'src/bom.py' ? '\uFEFF# 😀 \n' : sources[file]),
      },
    );

    expect(converted.map(({ location }) => location)).toEqual([
      { line: 9 },
      { line: 1, column: 5 },
    ]);
  });
  it('leaves a finding without a column, a missing file or a missing line as it is', () => {
    const findings = [
      { tool: 'ruff', rule: 'r', path: 'src/a.py', location: { line: 2 } },
      { ...finding('ruff', 2, 15), path: 'src/gone.py' },
      finding('ruff', 9, 15),
      { tool: 'ruff', rule: 'r', path: '.' },
      { ...finding('constructor', 2, 15) },
    ];

    expect(withUtf16Columns(findings, { units: { ruff: 'code-points' }, readSource })).toEqual(
      findings,
    );
  });
});
