import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { wrappedCall } from '../../languages/java/conventions/measures/test-support/wrapped-call.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { snapshotPolicy } from './resolve.mjs';

const { createGitRepository } = useGitFixtures();
const HEADER = "Following this project's conventions:\n";
const PALANTIR_CODE = wrappedCall({ step: 4, last: 100 });
const GOOGLE_CODE = wrappedCall({ step: 2, last: 85 });
const SPOTLESS_PALANTIR = 'spotless { java { palantirJavaFormat() } }';
const CHECKSTYLE_PATH = 'config/checkstyle/checkstyle.xml';
const CHECKSTYLE_120 =
  '<module name="Checker"><module name="TreeWalker"><module name="LineLength"><property name="max" value="120"/></module></module></module>';

function follow(config, files) {
  const { root } = createGitRepository(files);
  const chunks = [];
  const policy = snapshotPolicy({
    config,
    currentProjectRoot: root,
    headPolicy: resolveHeadPolicy(config, root),
    stdout: { write: (chunk) => chunks.push(chunk) },
  });
  return { conventions: policy.conventions, printed: chunks.join('') };
}

function javaFiles(code, count = 3) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`src/main/java/a/A${String(index)}.java`, code]),
  );
}

describe('the Java formatter and line length', () => {
  it('follows the formatter the build file names and fixes the width and indentation by it', () => {
    const files = { 'build.gradle': SPOTLESS_PALANTIR, ...javaFiles(GOOGLE_CODE) };

    expect(follow({ preset: 'java' }, files)).toEqual({
      conventions: {
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      },
      printed:
        HEADER +
        '  Java formatter: palantir-java-format (from your build file)\n' +
        '  Java indentation: 4 spaces (from palantir-java-format)\n' +
        '  Java line length: 120 columns (from palantir-java-format)\n',
    });
  });

  it('measures the formatter from the code when the build names none', () => {
    expect(follow({ preset: 'java' }, javaFiles(PALANTIR_CODE))).toEqual({
      conventions: {
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      },
      printed:
        HEADER +
        '  Java formatter: palantir-java-format (used by 3 of 3 measured files)\n' +
        '  Java indentation: 4 spaces (from palantir-java-format)\n' +
        '  Java line length: 120 columns (from palantir-java-format)\n',
    });
  });

  it('keeps google-java-format at 100 columns and follows the indentation of the files', () => {
    const aosp = wrappedCall({ step: 4, last: 77 });

    expect(follow({ preset: 'java' }, javaFiles(GOOGLE_CODE))).toEqual({
      conventions: undefined,
      printed: '',
    });
    expect(follow({ preset: 'java' }, javaFiles(aosp)).conventions).toEqual({
      'java.indentation': '4',
    });
  });

  it('measures the line length when no formatter runs, and a pin wins over the files', () => {
    const config = { preset: 'java', conventions: { 'java.formatter': 'none' } };
    const wide = wrappedCall({ step: 4, last: 100 });

    expect(follow(config, javaFiles(wide))).toEqual({
      conventions: { 'java.formatter': 'none', 'java.indentation': '4', 'java.lineLength': '120' },
      printed:
        HEADER +
        '  Java formatter: no Java formatter runs (set in nitpicker.config.json)\n' +
        '  Java indentation: 4 spaces (used by 3 of 3 measured files)\n' +
        '  Java line length: 120 columns (used by 3 of 3 measured files)\n',
    });
    expect(
      follow(
        { ...config, conventions: { ...config.conventions, 'java.lineLength': '140' } },
        javaFiles(wide),
      ).conventions,
    ).toEqual({ 'java.formatter': 'none', 'java.indentation': '4', 'java.lineLength': '140' });
  });

  it('refuses a pin the formatter contradicts', () => {
    const config = { preset: 'java', conventions: { 'java.lineLength': '120' } };

    expect(() =>
      follow(config, { 'build.gradle': 'googleJavaFormat()', ...javaFiles(GOOGLE_CODE) }),
    ).toThrow(
      '"conventions.java.lineLength" is "120", but google-java-format fixes it at "100". Remove the pin, or pin "conventions.java.formatter" to "none"',
    );
  });

  it('lets the Checkstyle LineLength win when the project config is listed, and ignores it otherwise', () => {
    const files = { [CHECKSTYLE_PATH]: CHECKSTYLE_120, ...javaFiles(GOOGLE_CODE) };
    const listed = { preset: 'java', tools: { checkstyle: { precedence: ['project'] } } };

    expect(follow(listed, files)).toEqual({
      conventions: { 'java.lineLength': '120' },
      printed: HEADER + '  Java line length: 120 columns (from your Checkstyle config)\n',
    });
    expect(follow({ preset: 'java' }, files).conventions).toBeUndefined();
  });

  it('gives the Java files of a Kotlin project the same treatment', () => {
    const files = { 'build.gradle.kts': SPOTLESS_PALANTIR, ...javaFiles(PALANTIR_CODE) };

    expect(follow({ preset: 'kotlin' }, files).conventions).toEqual({
      'java.formatter': 'palantir',
      'java.indentation': '4',
      'java.lineLength': '120',
    });
  });
});
