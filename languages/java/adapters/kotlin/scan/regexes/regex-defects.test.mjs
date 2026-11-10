import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { regexDefects } from './regex-defects.mjs';

function found(line) {
  const scanned = scanKotlinSource(`class Routes {\n    ${line}\n}\n`);
  return regexDefects(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.rule,
    reported.subject.split(' ')[0],
  ]);
}

describe('regexDefects', () => {
  it.each([
    ['a duplicate alternative', 'val kind = Regex("a|b|a")', 'regexp/no-dupe-disjunctions'],
    [
      'a duplicate class member',
      'val word = Regex("[\\\\w_]+")',
      'regexp/no-dupe-characters-character-class',
    ],
    [
      'an assertion that always rejects',
      'val word = "a\\\\bb".toRegex()',
      'regexp/no-useless-assertions',
    ],
    ['a raw string', 'val word = Regex("""a|b|a""")', 'regexp/no-dupe-disjunctions'],
    ['Pattern.compile', 'val word = Pattern.compile("x{1}")', 'regexp/no-useless-quantifier'],
    [
      'a case-insensitive duplicate range',
      'val word = Regex("[a-zA-Z]", RegexOption.IGNORE_CASE)',
      'regexp/no-dupe-characters-character-class',
    ],
    [
      'a named options argument',
      'val word = Regex("[a-zA-Z]", options = setOf(RegexOption.IGNORE_CASE))',
      'regexp/no-dupe-characters-character-class',
    ],
    [
      'Pattern.compile with flags 0',
      'val word = Pattern.compile("a|b|a", 0)',
      'regexp/no-dupe-disjunctions',
    ],
    [
      'an inline case-insensitive flag',
      'val word = Regex("(?i)[a-zA-Z]")',
      'regexp/no-dupe-characters-character-class',
    ],
  ])('reports %s', (_name, line, regexpRule) => {
    expect(found(line)).toEqual([[2, 'RegexPartDefect', regexpRule]]);
  });

  it('reports super-linear backtracking under its own rule', () => {
    expect(found('val word = Regex("^(a+)+$")')).toEqual([
      [2, 'BacktrackingRegex', 'regexp/no-super-linear-backtracking'],
      [2, 'RegexPartDefect', 'regexp/no-misleading-capturing-group'],
    ]);
  });

  it.each([
    ['a clean pattern', 'val id = Regex("^[a-z]+-\\\\d+$")'],
    ['a template', 'fun kind(a: String) = Regex("$a|b|$a")'],
    ['a possessive quantifier', 'val word = Regex("a|b|a++")'],
    ['an atomic group', 'val word = Regex("(?>a|b|a)")'],
    ['a POSIX class', 'val word = Regex("[\\\\p{Alpha}\\\\p{Alpha}]")'],
    ['a class intersection', 'val word = Regex("[a-z&&[^aa]]")'],
    ['a dollar before the end', 'val word = Regex("a$\\\\n|a$\\\\n")'],
    ['an unknown option', 'val word = Regex("a|a", RegexOption.COMMENTS)'],
    ['a value option', 'fun word(o: RegexOption) = Regex("a|a", o)'],
  ])('leaves %s alone', (_name, line) => {
    expect(found(line)).toEqual([]);
  });
});
