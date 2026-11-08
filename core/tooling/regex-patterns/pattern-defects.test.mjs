import { describe, expect, it } from 'vitest';
import { REGEX_DIALECTS, patternDefects } from './pattern-defects.mjs';

const { java, python, pythonAscii } = REGEX_DIALECTS;

function rules(pattern, flags, dialect = java) {
  return patternDefects(pattern, { flags, dialect }).defects?.map(
    ({ rule, kind }) => `${kind} ${rule}`,
  );
}

describe('patternDefects', () => {
  it.each([
    ['a duplicate alternative', 'a|b|a', '', ['part regexp/no-dupe-disjunctions']],
    [
      'a range the i flag repeats',
      '[a-zA-Z]',
      'i',
      ['part regexp/no-dupe-characters-character-class'],
    ],
    ['an inline i flag', '(?i)[a-zA-Z]', '', ['part regexp/no-dupe-characters-character-class']],
    ['an escaped hyphen outside a class', 'a\\-b|a\\-b', '', ['part regexp/no-dupe-disjunctions']],
    ['nested quantifiers', '^(?:a*b+)*$', '', ['backtracking regexp/no-super-linear-backtracking']],
    ['a dollar before the end under m', 'a$|a$', 'm', ['part regexp/no-dupe-disjunctions']],
    ['a backreference outside a loop', '(a)|\\1b', '', ['part regexp/no-useless-backreference']],
    ['an assertion that always rejects', '^(?=a)b', '', ['part regexp/no-useless-assertions']],
    ['a clean pattern', '^[a-z]+-\\d+$', '', []],
  ])('reports %s', (_name, pattern, flags, expected) => {
    expect(rules(pattern, flags)).toEqual(expected);
  });

  it.each([
    ['a lookahead on the newline a final $ also matches before', 'a(?=\\n)$', '', java],
    ['a negative lookahead on that newline', 'a(?!\\n)$', '', python],
    ['a line assertion next to a line terminator Java knows', 'a$\\S', 'm', java],
    ['a backreference kept across loop iterations', '(?:(a)|\\1b)+', '', java],
    ['a dot that excludes NEL in Java', '.|\\S', '', java],
    ['a dot next to a class Java tells apart from it', '[^\\n\\r]+.', '', java],
  ])('leaves alone %s', (_name, pattern, flags, dialect) => {
    expect(rules(pattern, flags, dialect)).toEqual([]);
  });

  it.each([
    ['flags x', 'a|a', 'x', java, 'flags x'],
    ['an inline x flag', '(?x)a|a', '', java, 'inline flags (?x)'],
    ['an empty pattern', '', '', java, 'an empty pattern'],
    ['a character above ASCII', 'é|é', '', java, 'a character above ASCII'],
    ['a hex escape above ASCII', '\\xe9|\\xe9', '', java, 'an escape above ASCII'],
    ['a braced escape', '[\\u{41}A]', '', java, 'a braced escape'],
    ['a class intersection', '[a-z&&[^aa]]', '', java, 'class intersection `&&`'],
    ['a lookbehind', '(?<=a+)b|(?<=a+)b', '', python, 'a lookbehind'],
    ['a property class', '\\p{Alpha}|\\p{Alpha}', '', java, '\\p'],
    ['a vertical-space class', '\\v|\\v', '', java, '\\v'],
    ['a Unicode \\d in Python', '\\d|[0-9]', '', python, '\\d'],
    ['a Unicode \\s in Python', '(?=\\s)\\x1c', '', python, '\\s'],
    ['a dollar before the end', 'a$\\n|a$\\n', '', java, 'a `$` before the end of the pattern'],
    ['a possessive quantifier', 'a|b|a++', '', java, 'syntax outside the shared subset'],
    ['an atomic group', '(?>a|b|a)', '', java, 'syntax outside the shared subset'],
    ['a Python named group', '(?P<id>a)|a', '', python, 'syntax outside the shared subset'],
  ])('skips %s', (_name, pattern, flags, dialect, skipped) => {
    expect(patternDefects(pattern, { flags, dialect })).toEqual({ skipped });
  });

  it('reads a dot as Python does', () => {
    expect(rules('[^\\n]+.', '', pythonAscii)).toEqual([
      'part regexp/optimal-quantifier-concatenation',
    ]);
  });

  it('reads \\d as ASCII in Java and under re.ASCII', () => {
    expect(rules('\\d|[0-9]', '', java)).toEqual(['part regexp/no-dupe-disjunctions']);
    expect(rules('\\d|[0-9]', '', pythonAscii)).toEqual(['part regexp/no-dupe-disjunctions']);
  });
});
