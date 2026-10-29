import { describe, expect, it } from 'vitest';
import { utf16Column, withUtf16Columns } from './utf16-columns.mjs';

const PYTHON_LINE = 's = "é😀"; x = undefined_name';
const JAVA_LINE = '\tint 😀 = 1;\tint x = 2;';

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
  it('undoes the tab stops of Checkstyle and javac, counting a surrogate pair as two', () => {
    expect(utf16Column(JAVA_LINE, 9, 'tab-expanded')).toBe(2);
    expect(utf16Column(JAVA_LINE, 13, 'tab-expanded')).toBe(6);
    expect(utf16Column(JAVA_LINE, 29, 'tab-expanded')).toBe(JAVA_LINE.indexOf('x') + 1);
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
  it('leaves a finding without a column, a missing file or a missing line as it is', () => {
    const findings = [
      { tool: 'ruff', rule: 'r', path: 'src/a.py', location: { line: 2 } },
      { ...finding('ruff', 2, 15), path: 'src/gone.py' },
      finding('ruff', 9, 15),
      { tool: 'ruff', rule: 'r', path: '.' },
    ];

    expect(withUtf16Columns(findings, { units: { ruff: 'code-points' }, readSource })).toEqual(
      findings,
    );
  });
});
