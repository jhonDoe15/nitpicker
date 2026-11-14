import { describe, expect, it } from 'vitest';
import { declaredJavaFormatter } from './java-formatter-detection.mjs';
import { SKIP_JAVADOC, SKIP_REFLOW } from './java-formatter-options.mjs';

function read(files) {
  return declaredJavaFormatter({
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  });
}

const POM = (properties, java) =>
  `<project><properties>${properties}</properties><build><plugins><plugin><artifactId>spotless-maven-plugin</artifactId><configuration><java>${java}</java></configuration></plugin></plugins></build></project>`;

describe('a formatter version or option that the build file does not write out', () => {
  it.each([
    [
      'a version catalog entry',
      { 'gradle/libs.versions.toml': '[versions]\ngjf = "1.25.2"\n' },
      'googleJavaFormat(libs.versions.gjf.get())',
    ],
    [
      'a catalog entry with dashes',
      { 'gradle/libs.versions.toml': '[versions]\ngoogle-java-format = { strictly = "1.25.2" }\n' },
      'googleJavaFormat(libs.versions.google.java.format.get())',
    ],
    [
      'gradle.properties',
      { 'gradle.properties': 'gjfVersion=1.25.2\n' },
      'googleJavaFormat(gjfVersion)',
    ],
    ['a string template', { 'gradle.properties': 'gjf=1.25.2\n' }, 'googleJavaFormat("$gjf")'],
    ['a local variable', {}, 'googleJavaFormat(gjf)', "def gjf = '1.25.2'\n"],
  ])('resolves %s', (_name, extra, call, prefix = '') => {
    const { declared, notes } = read({
      'build.gradle': `${prefix}spotless { java { ${call} } }`,
      ...extra,
    });

    expect(declared).toEqual({
      formatter: 'google',
      aosp: false,
      version: '1.25.2',
      options: [SKIP_REFLOW],
    });
    expect(notes).toEqual([]);
  });

  it('resolves a Maven property for the version and for an option', () => {
    const { declared, notes } = read({
      'pom.xml': POM(
        '<gjf>1.17.0</gjf><reflow>true</reflow>',
        `<googleJavaFormat><version>\${gjf}</version>` +
          `<reflowLongStrings>\${reflow}</reflowLongStrings></googleJavaFormat>`,
      ),
    });

    expect(declared).toEqual({ formatter: 'google', aosp: false, version: '1.17.0', options: [] });
    expect(notes).toEqual([]);
  });

  it('says so when a version cannot be read, and uses the pinned one', () => {
    const { declared, notes } = read({
      'build.gradle': 'spotless { java { googleJavaFormat(project.findProperty("gjf")) } }',
      'pom.xml': POM('', `<googleJavaFormat><version>\${missing}</version></googleJavaFormat>`),
    });

    expect(declared.version).toBeUndefined();
    expect(notes).toEqual([
      'Could not read the Java formatter version (project.findProperty("gjf")) in build.gradle; using the version nitpicker pins',
      `Could not read the Java formatter version (\${missing}) in pom.xml; using the version nitpicker pins`,
    ]);
  });

  it('treats an option it cannot read as not set, with a notice', () => {
    const { declared, notes } = read({
      'build.gradle':
        "spotless { java { palantirJavaFormat('2.50.0').formatJavadoc(project.hasProperty('j')).reflowLongStrings(flag) } }",
    });

    expect(declared.options).toEqual([SKIP_JAVADOC, SKIP_REFLOW]);
    expect(notes).toEqual([
      "Could not read formatJavadoc(project.hasProperty('j')) in build.gradle; using the Spotless default",
      'Could not read reflowLongStrings(flag) in build.gradle; using the Spotless default',
    ]);
  });
});

describe('several formatter declarations', () => {
  it('reads the java block of spotless and ignores a format block for other targets', () => {
    const build = `spotless {
      format 'docs', { target '*.md'; googleJavaFormat('1.1.0') }
      java { palantirJavaFormat('2.50.0') }
    }`;

    expect(read({ 'build.gradle': build }).declared).toEqual({
      formatter: 'palantir',
      aosp: false,
      version: '2.50.0',
      options: [SKIP_JAVADOC, SKIP_REFLOW],
    });
  });

  it('takes the version and the options from the same declaration, and says when two disagree', () => {
    const build =
      "spotless { java { googleJavaFormat('1.25.2').reflowLongStrings(); googleJavaFormat('1.10.0') } }";
    const { declared, notes } = read({ 'build.gradle': build });

    expect(declared).toEqual({ formatter: 'google', aosp: false, version: '1.25.2', options: [] });
    expect(notes).toEqual([
      'build.gradle declares google-java-format more than once with different versions or options; using the first',
    ]);
  });

  it('says when two build files disagree', () => {
    const { declared, notes } = read({
      'build.gradle': "spotless { java { googleJavaFormat('1.25.2') } }",
      'app/build.gradle': "spotless { java { googleJavaFormat('1.10.0') } }",
    });

    expect(declared.version).toBe('1.25.2');
    expect(notes).toEqual([
      'The build files declare google-java-format with different versions or options; using the one in build.gradle',
    ]);
  });
});
