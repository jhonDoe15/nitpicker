import { describe, expect, it } from 'vitest';
import { declaredJavaFormatter } from './java-formatter-detection.mjs';
import { SKIP_JAVADOC, SKIP_REFLOW } from './java-formatter-options.mjs';

function sourceWith(files) {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}

function detailed(files) {
  return declaredJavaFormatter(sourceWith(files)).declared;
}

function declared(files) {
  const found = detailed(files);
  return found === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(found).filter(([key]) => !['version', 'options'].includes(key)),
      );
}

const SPOTLESS_POM = (java) =>
  `<project><build><plugins><plugin><artifactId>spotless-maven-plugin</artifactId><configuration><java>${java}</java></configuration></plugin></plugins></build></project>`;
const FMT_POM = (configuration) =>
  `<project><build><plugins><plugin><groupId>com.spotify.fmt</groupId><artifactId>fmt-maven-plugin</artifactId>${configuration}</plugin></plugins></build></project>`;

describe('declaredJavaFormatter', () => {
  it.each([
    [
      'Spotless googleJavaFormat in Gradle',
      'build.gradle',
      'spotless { java { googleJavaFormat() } }',
      { formatter: 'google', aosp: false },
    ],
    [
      'Spotless palantirJavaFormat in Kotlin DSL',
      'build.gradle.kts',
      'spotless { java { palantirJavaFormat("2.50.0") } }',
      { formatter: 'palantir', aosp: false },
    ],
    [
      'the palantir Gradle plugin',
      'build.gradle',
      "plugins { id 'com.palantir.java-format' version '2.50.0' }",
      { formatter: 'palantir', aosp: false },
    ],
    [
      'the version catalog',
      'gradle/libs.versions.toml',
      'gjf = "com.google.googlejavaformat:google-java-format:1.25.2"',
      { formatter: 'google', aosp: false },
    ],
    [
      'spotless-maven-plugin with googleJavaFormat',
      'pom.xml',
      SPOTLESS_POM('<googleJavaFormat/>'),
      { formatter: 'google', aosp: false },
    ],
    [
      'spotless-maven-plugin with palantirJavaFormat',
      'pom.xml',
      SPOTLESS_POM('<palantirJavaFormat/>'),
      { formatter: 'palantir', aosp: false },
    ],
    ['fmt-maven-plugin', 'pom.xml', FMT_POM(''), { formatter: 'google', aosp: false }],
  ])('finds %s', (_name, file, text, expected) => {
    expect(declared({ [file]: text })).toEqual(expected);
  });

  it.each([
    ['Spotless eclipse() in Gradle', 'build.gradle', 'spotless { java { eclipse() } }'],
    ['Spotless prettier() in Kotlin DSL', 'build.gradle.kts', 'spotless { java { prettier() } }'],
    ['Spotless eclipse in Maven', 'pom.xml', SPOTLESS_POM('<eclipse><file>f.xml</file></eclipse>')],
    ['Spotless prettier in Maven', 'pom.xml', SPOTLESS_POM('<prettier/>')],
  ])('reads %s as no Java formatter', (_name, file, text) => {
    expect(declared({ [file]: text })).toEqual({ formatter: 'none', aosp: false });
  });

  it('ignores an eclipse() step outside the java block', () => {
    expect(
      declared({ 'build.gradle': 'spotless { groovy { greclipse() }\n kotlin { eclipse() } }' }),
    ).toBeUndefined();
  });

  it.each([
    ['googleJavaFormat().aosp()', 'spotless { java { googleJavaFormat().aosp() } }'],
    [
      "googleJavaFormat('1.25.2').style('AOSP')",
      "spotless { java { googleJavaFormat('1.25.2').style('AOSP') } }",
    ],
    [
      'aosp() after another step',
      'spotless { java { googleJavaFormat().reflowLongStrings().aosp() } }',
    ],
  ])('reads %s as google with four spaces', (_name, text) => {
    expect(declared({ 'build.gradle': text })).toEqual({ formatter: 'google', aosp: true });
  });

  it('reads the aosp style of the Maven plugins', () => {
    expect(
      declared({ 'pom.xml': FMT_POM('<configuration><style>aosp</style></configuration>') }),
    ).toEqual({
      formatter: 'google',
      aosp: true,
    });
    expect(
      declared({
        'pom.xml': SPOTLESS_POM('<googleJavaFormat><style>AOSP</style></googleJavaFormat>'),
      }),
    ).toEqual({
      formatter: 'google',
      aosp: true,
    });
  });

  it('reads palantirJavaFormat with the GOOGLE or AOSP style as google', () => {
    expect(
      declared({ 'build.gradle': 'spotless { java { palantirJavaFormat().style("GOOGLE") } }' }),
    ).toEqual({
      formatter: 'google',
      aosp: false,
    });
    expect(
      declared({
        'build.gradle.kts': 'spotless { java { palantirJavaFormat("2.50.0").style(\'AOSP\') } }',
      }),
    ).toEqual({
      formatter: 'google',
      aosp: true,
    });
    expect(
      declared({
        'pom.xml': SPOTLESS_POM('<palantirJavaFormat><style>GOOGLE</style></palantirJavaFormat>'),
      }),
    ).toEqual({
      formatter: 'google',
      aosp: false,
    });
    expect(
      declared({
        'pom.xml': SPOTLESS_POM('<palantirJavaFormat><style>PALANTIR</style></palantirJavaFormat>'),
      }),
    ).toEqual({
      formatter: 'palantir',
      aosp: false,
    });
  });

  it('prefers palantir when both are named in one file and ignores comments', () => {
    const both = 'spotless { java { googleJavaFormat(); palantirJavaFormat() } }';
    const commented =
      '// googleJavaFormat()\n/* palantirJavaFormat() */\nspotless { java { eclipse() } }';

    expect(declared({ 'build.gradle': both })).toEqual({ formatter: 'palantir', aosp: false });
    expect(declared({ 'build.gradle': commented })).toEqual({ formatter: 'none', aosp: false });
    expect(
      declared({ 'pom.xml': SPOTLESS_POM('<!-- <palantirJavaFormat/> --><googleJavaFormat/>') }),
    ).toEqual({
      formatter: 'google',
      aosp: false,
    });
    expect(declared({})).toBeUndefined();
  });

  it('keeps a glob with /* in it from opening a comment that swallows the formatter', () => {
    const gradle = (before, after) =>
      `spotless {\n java {\n ${before}\n googleJavaFormat()\n ${after}\n }\n}`;
    const groovy = gradle("target '**/*.java'", "targetExclude '**/*Test.java'");
    const kotlin = gradle('target("**/*.java")', 'targetExclude("**/*Test.java")');
    const pom = SPOTLESS_POM(
      '<includes><include>**/*.java</include></includes><googleJavaFormat/><excludes><exclude>**/*Test.java</exclude></excludes>',
    );

    expect(declared({ 'build.gradle': groovy })).toEqual({ formatter: 'google', aosp: false });
    expect(declared({ 'build.gradle.kts': kotlin })).toEqual({ formatter: 'google', aosp: false });
    expect(declared({ 'pom.xml': pom })).toEqual({ formatter: 'google', aosp: false });
  });

  it('keeps comment markers inside strings and strips real comments after them', () => {
    const text =
      "def a = '/* not a comment'\n// palantirJavaFormat()\nspotless { java { googleJavaFormat() } }\ndef b = '*/'";

    expect(declared({ 'build.gradle': text })).toEqual({ formatter: 'google', aosp: false });
    expect(
      declared({
        'gradle/libs.versions.toml':
          '# palantir-java-format\n[libraries]\ngjf = "google-java-format"',
      }),
    ).toEqual({
      formatter: 'google',
      aosp: false,
    });
  });

  it('reads module build files, buildSrc and build-logic convention plugins and module poms', () => {
    const palantir = 'spotless { java { palantirJavaFormat() } }';

    expect(declared({ 'services/api/build.gradle.kts': palantir })).toEqual({
      formatter: 'palantir',
      aosp: false,
    });
    expect(declared({ 'buildSrc/src/main/kotlin/java-conventions.gradle.kts': palantir })).toEqual({
      formatter: 'palantir',
      aosp: false,
    });
    expect(declared({ 'build-logic/convention/src/main/groovy/format.gradle': palantir })).toEqual({
      formatter: 'palantir',
      aosp: false,
    });
    expect(declared({ 'modules/core/pom.xml': SPOTLESS_POM('<palantirJavaFormat/>') })).toEqual({
      formatter: 'palantir',
      aosp: false,
    });
  });

  it('skips build files in sources, fixtures, dependencies and build output', () => {
    const palantir = 'spotless { java { palantirJavaFormat() } }';

    expect(
      declared({
        'src/test/resources/project/build.gradle': palantir,
        'fixtures/demo/build.gradle': palantir,
        'node_modules/pkg/build.gradle': palantir,
        'build/tmp/build.gradle': palantir,
        'target/pom.xml': SPOTLESS_POM('<palantirJavaFormat/>'),
      }),
    ).toBeUndefined();
  });

  it('follows the most common declaration and has no answer for a tie', () => {
    const google = 'spotless { java { googleJavaFormat() } }';
    const palantir = 'spotless { java { palantirJavaFormat() } }';

    expect(
      declared({ 'a/build.gradle': google, 'b/build.gradle': google, 'c/build.gradle': palantir }),
    ).toEqual({
      formatter: 'google',
      aosp: false,
    });
    expect(declared({ 'a/build.gradle': google, 'b/build.gradle': palantir })).toBeUndefined();
  });

  it('survives a pom that is not well-formed', () => {
    expect(declared({ 'pom.xml': '<project><plugin>' })).toBeUndefined();
  });
});

describe('declaredJavaFormatter notes', () => {
  it('says which pom it could not parse and why', () => {
    expect(declaredJavaFormatter(sourceWith({ 'pom.xml': '<project>' }))).toEqual({
      declared: undefined,
      notes: ['Could not read pom.xml: XML element <project> is not closed'],
    });
  });

  it('says how many build files it left out beyond its limit', () => {
    const files = Object.fromEntries(
      Array.from({ length: 203 }, (_, index) => [`m${String(index)}/build.gradle`, 'plugins {}']),
    );

    expect(declaredJavaFormatter(sourceWith(files)).notes).toEqual([
      'Read the first 200 build files and skipped 3 more',
    ]);
  });

  it.each([
    [
      'Spotless palantirJavaFormat with a version and formatJavadoc in Gradle',
      'build.gradle.kts',
      'spotless { java { palantirJavaFormat("2.90.0").formatJavadoc(true) } }',
      { formatter: 'palantir', version: '2.90.0', options: [SKIP_REFLOW] },
    ],
    [
      'Spotless palantirJavaFormat with defaults',
      'build.gradle',
      "spotless { java { palantirJavaFormat('2.50.0') } }",
      { formatter: 'palantir', version: '2.50.0', options: [SKIP_JAVADOC, SKIP_REFLOW] },
    ],
    [
      'Spotless googleJavaFormat with reflowLongStrings',
      'build.gradle.kts',
      'spotless { java { googleJavaFormat("1.25.2").reflowLongStrings() } }',
      { formatter: 'google', aosp: false, version: '1.25.2', options: [] },
    ],
    [
      'Spotless googleJavaFormat with formatJavadoc(false)',
      'build.gradle',
      "spotless { java { googleJavaFormat('1.25.2').aosp().formatJavadoc(false).reflowLongStrings(true) } }",
      { formatter: 'google', aosp: true, version: '1.25.2', options: [SKIP_JAVADOC] },
    ],
    [
      'Spotless googleJavaFormat without a version',
      'build.gradle',
      'spotless { java { googleJavaFormat() } }',
      { formatter: 'google', aosp: false, options: [SKIP_REFLOW] },
    ],
    [
      'spotless-maven-plugin palantirJavaFormat',
      'pom.xml',
      SPOTLESS_POM(
        '<palantirJavaFormat><version>2.90.0</version><formatJavadoc>true</formatJavadoc><reflowLongStrings>true</reflowLongStrings></palantirJavaFormat>',
      ),
      { formatter: 'palantir', version: '2.90.0', options: [] },
    ],
    [
      'spotless-maven-plugin googleJavaFormat',
      'pom.xml',
      SPOTLESS_POM(
        '<googleJavaFormat><version>1.17.0</version><style>AOSP</style></googleJavaFormat>',
      ),
      { formatter: 'google', aosp: true, version: '1.17.0', options: [SKIP_REFLOW] },
    ],
  ])('reads the version and options of %s', (_name, file, text, expected) => {
    expect(detailed({ [file]: text })).toEqual({ aosp: false, ...expected });
  });

  it.each([
    [
      'the palantir plugin',
      'build.gradle',
      "plugins { id 'com.palantir.java-format' version '2.50.0' }",
    ],
    [
      'a version catalog',
      'gradle/libs.versions.toml',
      'gjf = "com.google.googlejavaformat:google-java-format:1.25.2"',
    ],
    ['fmt-maven-plugin', 'pom.xml', FMT_POM('')],
    [
      'a style that makes palantir google',
      'build.gradle',
      'spotless { java { palantirJavaFormat("2.50.0").style("GOOGLE") } }',
    ],
  ])('takes no version or options from %s', (_name, file, text) => {
    const found = detailed({ [file]: text });
    expect(found.version).toBeUndefined();
    expect(found.options).toBeUndefined();
  });

  it('ignores a version that is not a release number', () => {
    expect(
      detailed({
        'build.gradle': 'spotless { java { googleJavaFormat(libs.versions.gjf.get()) } }',
      }),
    ).toEqual({ formatter: 'google', aosp: false, options: [SKIP_REFLOW] });
    expect(
      detailed({ 'build.gradle': "spotless { java { palantirJavaFormat('latest.release') } }" })
        .version,
    ).toBeUndefined();
  });
});
