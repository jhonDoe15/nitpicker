import { describe, expect, it } from 'vitest';
import { indentationStep, javaIndentation } from './measures/java-layout.mjs';

describe('indentationStep', () => {
  it('reads the step a block adds, not continuation lines or comments', () => {
    const google = [
      '/**',
      '    * Doc.',
      '    */',
      'class A {',
      '  void a(',
      '      int x) {',
      '    call(x,',
      '        x);',
      '  }',
      '}',
    ].join('\n');
    const aosp = 'class A { // demo\r\n    void a() {\r\n        call();\r\n    }\r\n}\r\n';

    expect(indentationStep(google)).toBe('2');
    expect(indentationStep(aosp)).toBe('4');
    expect(indentationStep('class A { // demo\n    int a;\n}\n')).toBe('4');
  });

  it('has no answer for tabs, flat files or a tie', () => {
    expect(indentationStep('class A {\n\tvoid a() {\n\t\tcall();\n\t}\n}\n')).toBeUndefined();
    expect(indentationStep('package a;\nimport b;\n')).toBeUndefined();
    expect(indentationStep('class A {\n  int a;\n}\nclass B {\n    int b;\n}\n')).toBeUndefined();
  });
});

describe('javaIndentation', () => {
  it('reads tabs as their own answer, where indentationStep has none', () => {
    expect(javaIndentation('class A {\n\tvoid a() {\n\t\tcall();\n\t}\n}\n')).toBe('tab');
  });

  it('reads spaces like indentationStep', () => {
    expect(javaIndentation('class A { // demo\n    int a;\n}\n')).toBe('4');
    expect(javaIndentation('class A {\n  int a;\n}\n')).toBe('2');
    expect(javaIndentation('package a;\nimport b;\n')).toBeUndefined();
  });

  it('lets tabs in a text block or a comment not outvote the indentation', () => {
    const text = [
      'class A {',
      '  String a = """',
      '\tone',
      '\ttwo',
      '\tthree',
      '  """;',
      '  int b;',
      '}',
      '',
    ].join('\n');

    expect(javaIndentation(text)).toBe('2');
  });
});
