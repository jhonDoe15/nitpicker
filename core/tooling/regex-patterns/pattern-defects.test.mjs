import { describe, expect, it } from 'vitest';
import { patternDefects } from './pattern-defects.mjs';

function rules(pattern, flags) {
  return patternDefects(pattern, { flags }).defects?.map(({ rule, kind }) => `${kind} ${rule}`);
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
    [
      'nested quantifiers',
      '^(\\s*\\w+)*$',
      '',
      ['backtracking regexp/no-super-linear-backtracking'],
    ],
    ['a dollar before the end under m', 'a$|a$', 'm', ['part regexp/no-dupe-disjunctions']],
    ['a clean pattern', '^[a-z]+-\\d+$', '', []],
  ])('reports %s', (_name, pattern, flags, expected) => {
    expect(rules(pattern, flags)).toEqual(expected);
  });

  it.each([
    ['flags x', 'a|a', 'x', 'flags x'],
    ['an inline x flag', '(?x)a|a', '', 'inline flags (?x)'],
    ['an empty pattern', '', '', 'an empty pattern'],
    ['a character above ASCII', 'é|é', '', 'a character above ASCII'],
    ['a hex escape above ASCII', '\\xe9|\\xe9', '', 'an escape above ASCII'],
    ['a class intersection', '[a-z&&[^aa]]', '', 'class intersection `&&`'],
    ['a property class', '\\p{Alpha}|\\p{Alpha}', '', '\\p'],
    ['a vertical-space class', '\\v|\\v', '', '\\v'],
    ['a dollar before the end', 'a$\\n|a$\\n', '', 'a `$` before the end of the pattern'],
    ['a possessive quantifier', 'a|b|a++', '', 'syntax outside the shared subset'],
    ['an atomic group', '(?>a|b|a)', '', 'syntax outside the shared subset'],
    ['a Python named group', '(?P<id>a)|a', '', 'syntax outside the shared subset'],
  ])('skips %s', (_name, pattern, flags, skipped) => {
    expect(patternDefects(pattern, { flags })).toEqual({ skipped });
  });
});
