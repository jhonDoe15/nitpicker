import { describe, expect, it } from 'vitest';
import { indentationStep } from './java-conventions.mjs';

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
    const aosp = 'class A {\r\n    void a() {\r\n        call();\r\n    }\r\n}\r\n';

    expect(indentationStep(google)).toBe('2');
    expect(indentationStep(aosp)).toBe('4');
  });

  it('has no answer for tabs, flat files or a tie', () => {
    expect(indentationStep('class A {\n\tvoid a() {\n\t\tcall();\n\t}\n}\n')).toBeUndefined();
    expect(indentationStep('package a;\nimport b;\n')).toBeUndefined();
    expect(indentationStep('class A {\n  int a;\n}\nclass B {\n    int b;\n}\n')).toBeUndefined();
  });
});
