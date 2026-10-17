import { describe, expect, it } from 'vitest';
import { formatterProfile, javaLineLength } from './java-layout.mjs';
import { wrappedCall } from './test-support/wrapped-call.mjs';

const GOOGLE = wrappedCall({ step: 2, last: 85 });
const AOSP = wrappedCall({ step: 4, last: 77 });
const PALANTIR = wrappedCall({ step: 4, last: 100 });
const WIDE = wrappedCall({ step: 4, last: 120 });

describe('javaLineLength', () => {
  it('reads the width from a call the formatter had to wrap', () => {
    expect(javaLineLength(GOOGLE)).toBe('100');
    expect(javaLineLength(AOSP)).toBe('100');
    expect(javaLineLength(PALANTIR)).toBe('120');
    expect(javaLineLength(WIDE)).toBe('140');
  });

  it('lets unbreakable lines not vote: imports, URLs, long string literals and text blocks', () => {
    const text = [
      `import ${'a.'.repeat(70)}B;`,
      'class A {',
      `  // see https://example.com/${'p'.repeat(100)}`,
      `  String s = "${'y'.repeat(130)}";`,
      '  String t = """',
      'z'.repeat(150),
      '  """;',
      '}',
    ].join('\n');

    expect(javaLineLength(text)).toBeUndefined();
  });

  it('has no answer for tabs', () => {
    expect(javaLineLength(GOOGLE.replaceAll('  ', '\t'))).toBeUndefined();
  });
});

const LONG_STATEMENTS = [
  'class A {',
  '    void run() {',
  `        int first = ${'a + '.repeat(22)}b;`,
  `        int second = ${'c + '.repeat(22)}d;`,
  '    }',
  '}',
  '',
].join('\n');
const TEXT_BLOCK_WITH_TAB = [
  'class A {',
  '  void run() {',
  '    service.process(',
  `        ${'x'.repeat(83)});`,
  '    String text = """',
  '\tindented by a tab',
  '    """;',
  '  }',
  '}',
  '',
].join('\n');

describe('formatterProfile', () => {
  it('reads two spaces and four spaces at 100 as google-java-format, in both styles', () => {
    expect(formatterProfile(GOOGLE)).toBe('google');
    expect(formatterProfile(AOSP)).toBe('google');
  });

  it('reads four spaces at 120 as palantir-java-format', () => {
    expect(formatterProfile(PALANTIR)).toBe('palantir');
  });

  it('reads tabs, 140 columns and two spaces at 120 as no formatter', () => {
    expect(formatterProfile(WIDE)).toBe('none');
    expect(formatterProfile(GOOGLE.replaceAll('  ', '\t'))).toBe('none');
    expect(formatterProfile(wrappedCall({ step: 2, last: 105 }))).toBe('none');
  });

  it('has no answer without evidence', () => {
    expect(formatterProfile('package a;\n\nclass A {}\n')).toBeUndefined();
  });

  it('has no answer for four-space files with long lines but no wrapped call', () => {
    expect(javaLineLength(LONG_STATEMENTS)).toBe('120');
    expect(formatterProfile(LONG_STATEMENTS)).toBeUndefined();
  });

  it('lets a tab inside a text block or a comment vote for nothing', () => {
    expect(formatterProfile(TEXT_BLOCK_WITH_TAB)).toBe('google');
    expect(javaLineLength(TEXT_BLOCK_WITH_TAB)).toBe('100');
    expect(
      formatterProfile(GOOGLE.replace('class A {', 'class A {\n\t// a tab in a comment')),
    ).toBe('google');
  });

  it('reads files whose blocks are indented with tabs as no formatter', () => {
    const tabs = 'class A {\n\tvoid a() {\n\t\tcall();\n\t}\n}\n';

    expect(formatterProfile(tabs)).toBe('none');
  });
});
