import { describe, expect, it } from 'vitest';
import { detektWildcardActive, kotlinEditorconfigValues } from './editorconfig-values.mjs';

describe('the keys an .editorconfig sets for Kotlin files', () => {
  it('reads the sections that cover .kt files and lets later sections win', () => {
    const text = [
      'root = true',
      'indent_size = 9',
      '',
      '[*]',
      'indent_size = 3',
      'charset = utf-8',
      '',
      '[*.md]',
      'indent_size = 7',
      '',
      '[*.{kt,kts}]',
      '# comment',
      'indent_size = 2',
      'ktlint_standard_no-wildcard-imports = Disabled',
      '',
      '[*.java]',
      'indent_size = 8',
    ].join('\n');

    expect(kotlinEditorconfigValues(text)).toEqual({
      indent_size: '2',
      charset: 'utf-8',
      'ktlint_standard_no-wildcard-imports': 'disabled',
    });
  });

  it('reads a .kt section on its own and nothing from other languages', () => {
    expect(kotlinEditorconfigValues('[*.kt]\nij_kotlin_allow_trailing_comma=false\n')).toEqual({
      ij_kotlin_allow_trailing_comma: 'false',
    });
    expect(kotlinEditorconfigValues('[*.{js,ts}]\nindent_size = 2\n')).toEqual({});
  });
});

describe('the WildcardImport setting of a detekt config', () => {
  it.each([
    ['style:\n  WildcardImport:\n    active: false\n', false],
    ['style:\n  WildcardImport:\n    active: true\n    excludeImports: []\n', true],
    [
      'style:\n  WildcardImport: # off\n    excludeImports: []\n  MagicNumber:\n    active: false\n',
      undefined,
    ],
    ['style:\n  MagicNumber:\n    active: false\n', undefined],
    ['', undefined],
  ])('reads %j as %s', (text, expected) => {
    expect(detektWildcardActive(text)).toBe(expected);
  });
});
