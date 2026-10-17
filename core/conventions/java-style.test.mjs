import { describe, expect, it } from 'vitest';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { wrappedCall } from '../../languages/java/conventions/measures/test-support/wrapped-call.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { comparisonPolicy, snapshotPolicy } from './resolve.mjs';

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

function compare(config, base, branch) {
  const { root } = createGitRepository(base);
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  writeFiles(root, branch);
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
  const chunks = [];
  const policy = comparisonPolicy(
    {
      config,
      currentProjectRoot: root,
      headPolicy: resolveHeadPolicy(config, root),
      stdout: { write: (chunk) => chunks.push(chunk) },
      repositoryRoot: root,
      base: { baseRef: 'main' },
    },
    resolveComparison,
  );
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

  it('refuses a pin that a pinned or build-declared formatter contradicts, and names the source', () => {
    const line = (formatter, source) =>
      `"conventions.java.lineLength" is "120", but ${formatter} (${source}) fixes it at "100". Remove the pin, or pin "conventions.java.formatter" to "none"`;
    const declared = { preset: 'java', conventions: { 'java.lineLength': '120' } };
    const pinned = {
      preset: 'java',
      conventions: { 'java.formatter': 'google', 'java.lineLength': '120' },
    };

    expect(() =>
      follow(declared, { 'build.gradle': 'googleJavaFormat()', ...javaFiles(GOOGLE_CODE) }),
    ).toThrow(line('google-java-format', 'declared in your build file'));
    expect(() => follow(pinned, javaFiles(GOOGLE_CODE))).toThrow(
      line('google-java-format', 'pinned in nitpicker.config.json'),
    );
  });

  it('refuses an indentation pin that a declared aosp or palantir formatter contradicts', () => {
    const config = { preset: 'java', conventions: { 'java.indentation': '2' } };

    expect(() =>
      follow(config, {
        'build.gradle': 'spotless { java { googleJavaFormat().aosp() } }',
        ...javaFiles(GOOGLE_CODE),
      }),
    ).toThrow(
      '"conventions.java.indentation" is "2", but google-java-format --aosp (declared in your build file) fixes it at "4". Remove the pin, or pin "conventions.java.formatter" to "none"',
    );
    expect(() =>
      follow(config, { 'build.gradle': SPOTLESS_PALANTIR, ...javaFiles(GOOGLE_CODE) }),
    ).toThrow(
      '"conventions.java.indentation" is "2", but palantir-java-format (declared in your build file) fixes it at "4". Remove the pin, or pin "conventions.java.formatter" to "none"',
    );
  });

  it('runs no formatter, instead of refusing, when a pin contradicts one that was only the default', () => {
    const config = { preset: 'java', conventions: { 'java.lineLength': '120' } };

    expect(follow(config, javaFiles(GOOGLE_CODE))).toEqual({
      conventions: { 'java.formatter': 'none', 'java.lineLength': '120' },
      printed:
        HEADER +
        '  Java formatter: no Java formatter runs (from your conventions.java.lineLength pin in nitpicker.config.json)\n' +
        '  Java line length: 120 columns (set in nitpicker.config.json)\n',
    });
    expect(follow(config, {}).conventions).toEqual({
      'java.formatter': 'none',
      'java.lineLength': '120',
    });
  });

  it('runs no formatter, instead of refusing, when a pin contradicts a measured palantir', () => {
    const config = { preset: 'java', conventions: { 'java.indentation': '2' } };

    expect(follow(config, javaFiles(PALANTIR_CODE))).toEqual({
      conventions: { 'java.formatter': 'none', 'java.lineLength': '120' },
      printed:
        HEADER +
        '  Java formatter: no Java formatter runs (from your conventions.java.indentation pin in nitpicker.config.json)\n' +
        '  Java line length: 120 columns (used by 3 of 3 measured files)\n',
    });
  });

  it('accepts a pinned line length that is none of 100, 120 and 140 when no formatter runs', () => {
    const config = {
      preset: 'java',
      conventions: { 'java.formatter': 'none', 'java.lineLength': '110' },
    };

    expect(follow(config, javaFiles(GOOGLE_CODE)).conventions).toEqual({
      'java.formatter': 'none',
      'java.lineLength': '110',
    });
  });

  it('lets the Checkstyle LineLength win when the project config is listed, and ignores it otherwise', () => {
    const files = { [CHECKSTYLE_PATH]: CHECKSTYLE_120, ...javaFiles(GOOGLE_CODE) };
    const listed = { preset: 'java', tools: { checkstyle: { precedence: ['project'] } } };

    expect(follow(listed, files)).toEqual({
      conventions: { 'java.formatter': 'none', 'java.lineLength': '120' },
      printed:
        HEADER +
        '  Java formatter: no Java formatter runs (from your Checkstyle config)\n' +
        '  Java line length: 120 columns (from your Checkstyle config)\n',
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

describe('evidence for the formatter', () => {
  const LONG_STATEMENTS = [
    'class A {',
    '    void run() {',
    `        int first = ${'a + '.repeat(22)}b;`,
    `        int second = ${'c + '.repeat(22)}d;`,
    '    }',
    '}',
    '',
  ].join('\n');

  it('keeps google-java-format for four-space files with long lines and no wrapped call', () => {
    expect(follow({ preset: 'java' }, javaFiles(LONG_STATEMENTS))).toEqual({
      conventions: { 'java.indentation': '4' },
      printed: HEADER + '  Java indentation: 4 spaces (used by 3 of 3 measured files)\n',
    });
  });

  it('keeps google-java-format when one file has a wrapped call', () => {
    const files = { ...javaFiles(LONG_STATEMENTS), 'src/main/java/a/Wrapped.java': PALANTIR_CODE };

    expect(follow({ preset: 'java' }, files).conventions).toEqual({ 'java.indentation': '4' });
  });

  it('keeps google-java-format when the wrapped calls are not a clear majority', () => {
    const files = {
      ...javaFiles(PALANTIR_CODE, 3),
      'src/main/java/b/B0.java': wrappedCall({ step: 2, last: 85 }),
      'src/main/java/b/B1.java': wrappedCall({ step: 2, last: 85 }),
      'src/main/java/b/B2.java': wrappedCall({ step: 2, last: 85 }),
    };

    expect(follow({ preset: 'java' }, files).conventions).toBeUndefined();
  });

  it('reads two spaces at 120 columns as no formatter', () => {
    expect(
      follow({ preset: 'java' }, javaFiles(wrappedCall({ step: 2, last: 105 }))).conventions,
    ).toEqual({
      'java.formatter': 'none',
      'java.lineLength': '120',
    });
  });
});

describe('the Checkstyle LineLength', () => {
  const listed = { preset: 'java', tools: { checkstyle: { precedence: ['project'] } } };
  const lineLength = (module) =>
    `<module name="Checker"><module name="TreeWalker">${module}</module></module>`;

  it.each(['110', '150', '160'])(
    'follows a max of %s, which is none of the common widths',
    (max) => {
      const config = lineLength(
        `<module name="LineLength"><property name="max" value="${max}"/></module>`,
      );

      expect(follow(listed, { [CHECKSTYLE_PATH]: config, ...javaFiles(GOOGLE_CODE) })).toEqual({
        conventions: { 'java.formatter': 'none', 'java.lineLength': max },
        printed:
          HEADER +
          '  Java formatter: no Java formatter runs (from your Checkstyle config)\n' +
          `  Java line length: ${max} columns (from your Checkstyle config)\n`,
      });
    },
  );

  it("reads a LineLength module without a max as Checkstyle's default of 80", () => {
    const files = { [CHECKSTYLE_PATH]: lineLength('<module name="LineLength"/>') };

    expect(follow(listed, { ...files, ...javaFiles(GOOGLE_CODE) }).conventions).toEqual({
      'java.formatter': 'none',
      'java.lineLength': '80',
    });
  });

  it('keeps a width a declared formatter fixes, and runs the formatter at it', () => {
    const files = {
      [CHECKSTYLE_PATH]: lineLength(
        '<module name="LineLength"><property name="max" value="110"/></module>',
      ),
      'build.gradle': 'spotless { java { googleJavaFormat() } }',
      ...javaFiles(GOOGLE_CODE),
    };

    expect(follow(listed, files).conventions).toEqual({ 'java.lineLength': '110' });
  });
});

describe('where the formatter is declared', () => {
  it('reads module build files, buildSrc and build-logic convention plugins', () => {
    for (const file of [
      'services/api/build.gradle.kts',
      'buildSrc/src/main/kotlin/java.gradle.kts',
      'build-logic/convention/src/main/groovy/format.gradle',
      'services/api/pom.xml',
    ]) {
      const text = file.endsWith('pom.xml')
        ? '<project><plugin><artifactId>spotless-maven-plugin</artifactId><configuration><java><palantirJavaFormat/></java></configuration></plugin></project>'
        : SPOTLESS_PALANTIR;

      expect(
        follow({ preset: 'java' }, { [file]: text, ...javaFiles(GOOGLE_CODE) }).conventions,
      ).toEqual({
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      });
    }
  });

  it('reads Spotless aosp as google-java-format with four spaces', () => {
    const build = 'spotless { java { googleJavaFormat().aosp() } }';

    expect(
      follow({ preset: 'java' }, { 'build.gradle': build, ...javaFiles(GOOGLE_CODE) }),
    ).toEqual({
      conventions: { 'java.indentation': '4' },
      printed: HEADER + '  Java indentation: 4 spaces (from google-java-format --aosp)\n',
    });
  });

  it('maps Spotless eclipse() and prettier() to no formatter', () => {
    const build = 'spotless { java { eclipse() } }';

    expect(
      follow({ preset: 'java' }, { 'build.gradle': build, ...javaFiles(GOOGLE_CODE) }),
    ).toEqual({
      conventions: { 'java.formatter': 'none' },
      printed: HEADER + '  Java formatter: no Java formatter runs (from your build file)\n',
    });
  });

  it('finds the formatter next to globs that contain /*', () => {
    const build =
      "spotless {\n java {\n target '**/*.java'\n palantirJavaFormat()\n targetExclude '**/*Test.java'\n }\n}";

    expect(
      follow({ preset: 'java' }, { 'build.gradle': build, ...javaFiles(GOOGLE_CODE) }).conventions,
    ).toEqual({
      'java.formatter': 'palantir',
      'java.indentation': '4',
      'java.lineLength': '120',
    });
  });

  it('reads the base, so a branch that adds a formatter does not loosen its own limits', () => {
    const base = javaFiles(GOOGLE_CODE);

    expect(compare({ preset: 'java' }, base, { 'build.gradle': SPOTLESS_PALANTIR })).toEqual({
      conventions: undefined,
      printed: '',
    });
    expect(
      compare(
        { preset: 'java' },
        { 'build.gradle': SPOTLESS_PALANTIR, ...base },
        { 'README.md': 'x' },
      ).conventions,
    ).toEqual({ 'java.formatter': 'palantir', 'java.indentation': '4', 'java.lineLength': '120' });
  });

  it('reads the base Checkstyle config too, so a branch cannot widen the limit by editing it', () => {
    const listed = { preset: 'java', tools: { checkstyle: { precedence: ['project'] } } };
    const wide = `<module name="Checker"><module name="LineLength"><property name="max" value="160"/></module></module>`;

    expect(
      compare(listed, javaFiles(GOOGLE_CODE), { [CHECKSTYLE_PATH]: wide }).conventions,
    ).toBeUndefined();
  });

  it('reads the working tree when the base has no files of the project', () => {
    const files = { 'build.gradle': SPOTLESS_PALANTIR, ...javaFiles(GOOGLE_CODE) };

    expect(compare({ preset: 'java' }, { 'README.md': 'x' }, files).conventions).toEqual({
      'java.formatter': 'palantir',
      'java.indentation': '4',
      'java.lineLength': '120',
    });
  });
});
