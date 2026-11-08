import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { javaStringLiteral, withRegexDefects } from './regex-defects.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-regex-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function candidates(line, rules = ['RegexPartDefect', 'BacktrackingRegex']) {
  const file = 'Patterns.java';
  writeFileSync(path.join(root, file), `class Patterns {\n${line}\n}\n`);
  const column = line.indexOf('"') + 1;
  const findings = rules.map((rule) => ({
    tool: 'pmd',
    rule,
    path: file,
    identity: `id-${rule}`,
    message: 'generic',
    location: { line: 2, column },
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
