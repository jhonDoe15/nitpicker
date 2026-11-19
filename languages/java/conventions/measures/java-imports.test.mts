import { describe, expect, it } from 'vitest';
import {
  JAVA_CONVENTIONS,
  JAVA_TEST_STATIC_IMPORTS,
  JAVA_WILDCARD_IMPORTS,
} from '../java-conventions.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { isTestSource } from './java-imports.mts';

function measure(id: string, ...args: string[]): unknown {
  return callUntyped(
    fieldOf(
      JAVA_CONVENTIONS.find((convention) => convention.id === id),
      'measure',
    ),
    ...args,
  );
}
const MAIN = 'src/main/java/a/A.java';
const TEST = 'src/test/java/a/ATest.java';

describe('java.wildcardImports', () => {
  it.each([
    ['explicit imports', 'package a;\n\nimport b.C;\nimport b.D;\n', MAIN, 'explicit'],
    ['one wildcard among explicit imports', 'import b.C;\nimport d.*;\n', MAIN, 'wildcard'],
    ['a static wildcard in main code', 'import static b.C.*;\n', MAIN, 'wildcard'],
    ['a static wildcard in a test', 'import static b.C.*;\nimport d.E;\n', TEST, 'explicit'],
    ['a plain wildcard in a test', 'import static b.C.*;\nimport d.*;\n', TEST, 'wildcard'],
    ['an explicit static import', 'import static b.C.d;\n', MAIN, 'explicit'],
    ['an import with a $ in a name', 'import a.Outer$Inner;\n', MAIN, 'explicit'],
    ['a wildcard after a $ import', 'import a.Outer$Inner;\nimport b.*;\n', MAIN, 'wildcard'],
    ['no imports', 'package a;\n\nclass A {}\n', MAIN, undefined],
    ['an import in a comment', '// import a.*;\nimport b.C;\n', MAIN, 'explicit'],
    ['java.util.*, which no tool allows', 'import java.util.*;\n', MAIN, 'wildcard'],
  ])('reads %s', (_name, text, file, expected) => {
    expect(measure(JAVA_WILDCARD_IMPORTS, text, file)).toBe(expected);
  });
});

describe('java.testStaticImports', () => {
  it.each([
    ['a static wildcard', 'import static org.assertj.core.api.Assertions.*;\n', 'wildcard'],
    [
      'named static imports',
      'import static org.assertj.core.api.Assertions.assertThat;\n',
      'explicit',
    ],
    [
      'a mix, which leans to the wildcard',
      'import static a.B.*;\nimport static a.C.d;\n',
      'wildcard',
    ],
    ['only plain imports', 'import a.B;\nimport a.*;\n', undefined],
  ])('reads %s', (_name, text, expected) => {
    expect(measure(JAVA_TEST_STATIC_IMPORTS, text)).toBe(expected);
  });

  it('measures the test source sets only', () => {
    const files = fieldOf(
      JAVA_CONVENTIONS.find(({ id }) => id === JAVA_TEST_STATIC_IMPORTS),
      'files',
    );

    expect(files).toEqual(['**/src/{test,tests,testFixtures,*Test,*Tests}/**/*.java']);
  });
});

describe('isTestSource', () => {
  it.each([
    ['src/test/java/a/A.java', true],
    ['module/src/integrationTest/java/a/A.java', true],
    ['src/main/java/a/A.java', false],
    ['src/main/java/a/test/A.java', false],
    ['src/testFixtures/java/a/A.java', true],
    ['src/intTest/java/a/A.java', true],
    ['src/latest/java/a/A.java', false],
    ['src/contest/java/a/A.java', false],
    ['A.java', false],
  ])('%s is %s', (file, expected) => {
    expect(isTestSource(file)).toBe(expected);
  });
});
