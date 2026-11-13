import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { javaStringLiteral, withRegexDefects } from './regex-defects.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-regex-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function candidates(code, { from = 0 } = {}) {
  const file = 'Patterns.java';
  const text = `class Patterns {\n${code}\n}\n`;
  writeFileSync(path.join(root, file), text);
  const before = text.slice(0, text.indexOf('"', text.indexOf(code) + from)).split('\n');
  const findings = ['RegexPartDefect', 'BacktrackingRegex'].map((rule) => ({
    tool: 'pmd',
    rule,
    path: file,
    identity: `id-${rule}`,
    message: 'generic',
    location: { line: before.length, column: before.at(-1).length + 1 },
  }));
  return withRegexDefects(findings, root);
}

function reported(line) {
  return candidates(line).map(({ rule, message }) => [rule, message.split('.')[0]]);
}

describe('Java regex pattern defects', () => {
  it.each([
    [
      'Pattern.compile',
      '  Pattern P = Pattern.compile("a|b|a");',
      'Unexpected duplicate alternative',
    ],
    [
      'String.matches',
      '  boolean m(String s) { return s.matches("[\\\\w_]+"); }',
      "'_' (U+005f) is already included in '\\w'",
    ],
    [
      'String.split',
      '  String[] s(String s) { return s.split("x{1}"); }',
      'Unexpected useless quantifier',
    ],
    ['flags 0', '  Pattern P = Pattern.compile("a|b|a", 0);', 'Unexpected duplicate alternative'],
    [
      'CASE_INSENSITIVE with UNICODE_CASE',
      '  Pattern P = Pattern.compile("[a-zA-Z]", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);',
      'Unexpected duplicate',
    ],
    [
      'a CASE_INSENSITIVE flag',
      '  Pattern P = Pattern.compile("[a-zA-Z]", Pattern.CASE_INSENSITIVE);',
      'Unexpected duplicate',
    ],
  ])('reports %s', (_name, line, start) => {
    expect(reported(line)).toEqual([['RegexPartDefect', start]]);
  });

  it('keeps backtracking under its own rule and gives each defect its own identity', () => {
    const found = candidates('  Pattern P = Pattern.compile("(\\\\s*\\\\w+)*x|a|a");');

    expect(found.map(({ rule }) => rule).toSorted()).toEqual([
      'BacktrackingRegex',
      'RegexPartDefect',
    ]);
    expect(new Set(found.map(({ identity }) => identity)).size).toBe(found.length);
  });

  it('reads the literal PMD points at, not an earlier string on the line', () => {
    const line = '  String[] s(String s) { return s.replace("a|a", "b").split("x{1}"); }';

    expect(
      candidates(line, { from: line.indexOf('split') }).map(({ message }) => message.split('.')[0]),
    ).toEqual(['Unexpected useless quantifier']);
  });

  it('keys the identity on the pattern, so a site above does not change it', () => {
    const line = '  boolean m(String s) { return s.matches("a|b|a"); }';
    const [alone] = candidates(line);
    const code = `  Pattern Q = Pattern.compile("^[a-z]+$");\n${line}`;
    const [below] = candidates(code, { from: code.indexOf('matches') });

    expect(below.identity).toBe(alone.identity);
  });

  it.each([
    ['a clean pattern', '  Pattern P = Pattern.compile("^[a-z]+-\\\\d+$");'],
    ['a possessive quantifier', '  Pattern P = Pattern.compile("a|b|a++");'],
    ['a POSIX class', '  Pattern P = Pattern.compile("\\\\p{Alpha}|\\\\p{Alpha}");'],
    ['a COMMENTS flag', '  Pattern P = Pattern.compile("a|a", Pattern.COMMENTS);'],
    ['a flags variable', '  Pattern p(int f) { return Pattern.compile("a|a", f); }'],
    ['a split limit', '  String[] s(String s) { return s.split("[ab]", 2); }'],
  ])('leaves %s alone', (_name, line) => {
    expect(candidates(line)).toEqual([]);
  });

  it('keeps findings of other rules', () => {
    const other = {
      tool: 'pmd',
      rule: 'PlainTextRegex',
      path: 'X.java',
      identity: 'x',
      message: 'm',
    };

    expect(withRegexDefects([other], root)).toEqual([other]);
  });

  it.each([
    ['"a\\\\d"', 'a\\d'],
    ['"tab\\there"', 'tab\there'],
    ['"\\u0041\\101"', 'AA'],
    ['"q\\"x"', 'q"x'],
  ])('decodes the literal %s', (source, value) => {
    expect(javaStringLiteral(source, 0)?.value).toBe(value);
  });

  it('does not read a text block', () => {
    expect(javaStringLiteral('"""\n  a|a\n  """', 0)).toBeUndefined();
  });
});
