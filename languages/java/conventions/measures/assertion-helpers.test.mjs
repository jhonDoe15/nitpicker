import { describe, expect, it } from 'vitest';
import { detectConventions } from '../../../../shared/conventions/detect.mjs';
import { JAVA_CONVENTIONS } from '../java-conventions.mjs';
import { KOTLIN_CONVENTIONS } from '../kotlin-conventions.mjs';
import { nitpickerAssertionNames } from './assertion-helpers.mjs';

function helpersIn(files, definitions, id) {
  const source = {
    paths: () => Object.keys(files),
    readMany: (paths) => new Map(paths.map((file) => [file, files[file]])),
  };
  return detectConventions({ definitions, source })[id].choice;
}

const javaHelpers = (files) => helpersIn(files, JAVA_CONVENTIONS, 'java.assertionHelpers');
const kotlinHelpers = (files) => helpersIn(files, KOTLIN_CONVENTIONS, 'kotlin.assertionHelpers');

const javaTest = (call, annotation = '@Test') =>
  `class T {\n  ${annotation}\n  void works() {\n    setup();\n    ${call};\n  }\n}\n`;
const javaSupport = (name, body) =>
  `class Support {\n  static void ${name}(Result r) {\n    ${body};\n  }\n}\n`;
const kotlinTest = (call, annotation = '@Test') =>
  `class T {\n  ${annotation}\n  fun works() {\n    setup()\n    ${call}\n  }\n}\n`;
const kotlinSupport = (name, body) => `fun ${name}(r: Result) {\n  ${body}\n}\n`;

const javaTests = (call, count = 3, annotation = '@Test') =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `src/test/java/T${String(index)}Test.java`,
      javaTest(call, annotation),
    ]),
  );
const kotlinTests = (call, count = 3, annotation = '@Test') =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `src/test/kotlin/T${String(index)}Test.kt`,
      kotlinTest(call, annotation),
    ]),
  );

describe('java.assertionHelpers', () => {
  const support = { 'src/test/java/Support.java': javaSupport('ensureOk', 'assertTrue(r.ok())') };

  it('follows a helper that ends tests in three files and asserts where it is defined', () => {
    expect(javaHelpers({ ...support, ...javaTests('ensureOk(result)') })).toEqual(['ensureOk']);
  });

  it('also accepts a helper defined in a test-support folder that throws', () => {
    const thrower = {
      'testkit/Support.java': javaSupport('ensureOk', 'throw new AssertionError()'),
    };

    expect(javaHelpers({ ...thrower, ...javaTests('ensureOk(result)') })).toEqual(['ensureOk']);
  });

  it('needs three files, not two', () => {
    expect(javaHelpers({ ...support, ...javaTests('ensureOk(result)', 2) })).toEqual([]);
  });

  it('needs a definition with an assertion in test code', () => {
    const production = {
      'src/main/java/Checks.java': javaSupport('ensureOk', 'assertTrue(r.ok())'),
    };
    const hollow = { 'src/test/java/Support.java': javaSupport('ensureOk', 'log(r)') };

    expect(javaHelpers({ ...javaTests('ensureOk(result)') })).toEqual([]);
    expect(javaHelpers({ ...production, ...javaTests('ensureOk(result)') })).toEqual([]);
    expect(javaHelpers({ ...hollow, ...javaTests('ensureOk(result)') })).toEqual([]);
  });

  it('does not learn production calls such as validate, isEmpty, hasItems and requireAdmin', () => {
    const production = {
      'src/main/java/Checks.java': ['validate', 'isEmpty', 'hasItems', 'requireAdmin']
        .map((name) => javaSupport(name, 'assertTrue(true)'))
        .join(''),
    };
    const calls = Object.assign(
      {},
      ...['validate', 'isEmpty', 'hasItems', 'requireAdmin'].map((name) =>
        Object.fromEntries(
          [1, 2, 3].map((index) => [
            `src/test/java/${name}${String(index)}Test.java`,
            javaTest(`${name}(x)`),
          ]),
        ),
      ),
    );

    expect(javaHelpers({ ...production, ...calls })).toEqual([]);
  });

  it('lets tests that already assert, and disabled tests, not vote', () => {
    const asserting = javaTests('assertTrue(ensureOk(result))');
    const disabled = javaTests('ensureOk(result)', 3, '@Disabled @Test');

    expect(javaHelpers({ ...support, ...asserting })).toEqual([]);
    expect(javaHelpers({ ...support, ...disabled })).toEqual([]);
  });

  it('skips the names nitpicker already treats as assertions', () => {
    const [known] = nitpickerAssertionNames();
    const files = {
      'src/test/java/Support.java': javaSupport(known, 'assertTrue(r.ok())'),
      ...javaTests(`${known}(result)`),
    };

    expect(javaHelpers(files)).toEqual([]);
  });
});

describe('kotlin.assertionHelpers', () => {
  const support = {
    'src/test/kotlin/Support.kt': kotlinSupport('ensureOk', 'assertTrue(r.ok)'),
  };

  it('follows a helper that ends tests in three files and asserts where it is defined', () => {
    expect(kotlinHelpers({ ...support, ...kotlinTests('ensureOk(result)') })).toEqual(['ensureOk']);
  });

  it('needs three files, a proven definition and enabled tests without another assertion', () => {
    expect(kotlinHelpers({ ...support, ...kotlinTests('ensureOk(result)', 2) })).toEqual([]);
    expect(kotlinHelpers({ ...kotlinTests('ensureOk(result)') })).toEqual([]);
    expect(
      kotlinHelpers({ ...support, ...kotlinTests('ensureOk(result)', 3, '@Ignore @Test') }),
    ).toEqual([]);
    expect(kotlinHelpers({ ...support, ...kotlinTests('result shouldBe ensureOk(x)') })).toEqual(
      [],
    );
  });
});
