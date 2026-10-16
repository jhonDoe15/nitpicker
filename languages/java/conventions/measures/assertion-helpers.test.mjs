import { describe, expect, it } from 'vitest';
import { assertionHelpers, nitpickerAssertionNames } from './assertion-helpers.mjs';

const javaTest = (call) =>
  `class T {\n  @Test\n  void works() {\n    setup();\n    ${call};\n  }\n}\n`;

describe('assertionHelpers', () => {
  it('names the project helper that ends a Java test without a known assertion', () => {
    expect(assertionHelpers(javaTest('expectOk(result)'), 'java')).toEqual(['expectOk']);
  });

  it('ignores tests that already assert and calls without assertion vocabulary', () => {
    expect(assertionHelpers(javaTest('assertEquals(1, x)'), 'java')).toEqual([]);
    expect(assertionHelpers(javaTest('service.run()'), 'java')).toEqual([]);
  });

  it('skips the names nitpicker already treats as assertions', () => {
    const [known] = nitpickerAssertionNames();

    expect(assertionHelpers(javaTest(`${known}(result)`), 'java')).toEqual([]);
  });

  it('names the helper that ends a Kotlin test', () => {
    const text = 'class T {\n  @Test\n  fun works() {\n    setup()\n    mustBeOk(result)\n  }\n}\n';

    expect(assertionHelpers(text, 'kotlin')).toEqual(['mustBeOk']);
  });
});
