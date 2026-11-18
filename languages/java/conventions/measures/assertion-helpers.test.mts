import { describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { detectConventions } from '../../../../shared/conventions/detect.mjs';
import { JAVA_ASSERTION_HELPERS, JAVA_CONVENTIONS } from '../java-conventions.mts';
import { KOTLIN_CONVENTIONS } from '../kotlin-conventions.mts';
import type { ConventionDefinition } from '../../../../shared/values/config-types.mts';
import { defined } from '../../builds/test-support/defined.mts';
import { MIN_FILES, nitpickerAssertionNames } from './assertion-helpers.mts';

type Files = Record<string, string>;

function helpersIn(
  files: Files,
  definitions: readonly ConventionDefinition[],
  id: string,
): unknown {
  const source = {
    paths: () => Object.keys(files),
    readMany: (paths: readonly string[]) => new Map(paths.map((file) => [file, files[file]])),
  };
  return fieldOf(fieldOf(detectConventions({ definitions, source }), id), 'choice');
}

function javaHelpers(files: Files): unknown {
  return helpersIn(files, JAVA_CONVENTIONS, JAVA_ASSERTION_HELPERS);
}

function kotlinHelpers(files: Files): unknown {
  return helpersIn(files, KOTLIN_CONVENTIONS, 'kotlin.assertionHelpers');
}

function javaTest(call: string, annotation = '@Test'): string {
  return `class T {\n  ${annotation}\n  void works() {\n    setup();\n    ${call};\n  }\n}\n`;
}

function javaSupport(name: string, body: string): string {
  return `class Support {\n  static void ${name}(Result r) {\n    ${body};\n  }\n}\n`;
}

function kotlinTest(call: string, annotation = '@Test'): string {
  return `class T {\n  ${annotation}\n  fun works() {\n    setup()\n    ${call}\n  }\n}\n`;
}

function kotlinSupport(name: string, body: string): string {
  return `fun ${name}(r: Result) {\n  ${body}\n}\n`;
}

function javaTests(call: string, count = MIN_FILES, annotation = '@Test'): Files {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `src/test/java/T${String(index)}Test.java`,
      javaTest(call, annotation),
    ]),
  );
}

function kotlinTests(call: string, count = MIN_FILES, annotation = '@Test'): Files {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `src/test/kotlin/T${String(index)}Test.kt`,
      kotlinTest(call, annotation),
    ]),
  );
}

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
    expect(javaHelpers({ ...support, ...javaTests('ensureOk(result)', MIN_FILES - 1) })).toEqual(
      [],
    );
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
    const calls = Object.fromEntries(
      ['validate', 'isEmpty', 'hasItems', 'requireAdmin'].flatMap((name) =>
        Array.from({ length: MIN_FILES }, (_, offset) => offset + 1).map((index) => [
          `src/test/java/${name}${String(index)}Test.java`,
          javaTest(`${name}(x)`),
        ]),
      ),
    );

    expect(javaHelpers({ ...production, ...calls })).toEqual([]);
  });

  it('lets tests that already assert, and disabled tests, not vote', () => {
    const asserting = javaTests('assertTrue(ensureOk(result))');
    const disabled = javaTests('ensureOk(result)', MIN_FILES, '@Disabled @Test');

    expect(javaHelpers({ ...support, ...asserting })).toEqual([]);
    expect(javaHelpers({ ...support, ...disabled })).toEqual([]);
  });

  it('skips the names nitpicker already treats as assertions', () => {
    const known = defined(nitpickerAssertionNames()[0]);
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
    expect(
      kotlinHelpers({ ...support, ...kotlinTests('ensureOk(result)', MIN_FILES - 1) }),
    ).toEqual([]);
    expect(kotlinHelpers({ ...kotlinTests('ensureOk(result)') })).toEqual([]);
    expect(
      kotlinHelpers({ ...support, ...kotlinTests('ensureOk(result)', MIN_FILES, '@Ignore @Test') }),
    ).toEqual([]);
    expect(kotlinHelpers({ ...support, ...kotlinTests('result shouldBe ensureOk(x)') })).toEqual(
      [],
    );
  });
});
