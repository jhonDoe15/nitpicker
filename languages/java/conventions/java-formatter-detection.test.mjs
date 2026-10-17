import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkstyleLineLength, declaredJavaFormatter } from './java-formatter-detection.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-formatter-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('declaredJavaFormatter', () => {
  it.each([
    [
      'Spotless googleJavaFormat in Gradle',
      'build.gradle',
      'spotless { java { googleJavaFormat() } }',
      'google',
    ],
    [
      'Spotless palantirJavaFormat in Kotlin DSL',
      'build.gradle.kts',
      'spotless { java { palantirJavaFormat("2.50.0") } }',
      'palantir',
    ],
    [
      'the palantir Gradle plugin',
      'build.gradle',
      "plugins { id 'com.palantir.java-format' version '2.50.0' }",
      'palantir',
    ],
    [
      'the version catalog',
      'gradle/libs.versions.toml',
      'gjf = "com.google.googlejavaformat:google-java-format:1.25.2"',
      'google',
    ],
    [
      'spotless-maven-plugin with googleJavaFormat',
      'pom.xml',
      '<plugin><artifactId>spotless-maven-plugin</artifactId><configuration><java><googleJavaFormat/></java></configuration></plugin>',
      'google',
    ],
    [
      'spotless-maven-plugin with palantirJavaFormat',
      'pom.xml',
      '<plugin><artifactId>spotless-maven-plugin</artifactId><configuration><java><palantirJavaFormat/></java></configuration></plugin>',
      'palantir',
    ],
    [
      'fmt-maven-plugin',
      'pom.xml',
      '<plugin><groupId>com.spotify.fmt</groupId><artifactId>fmt-maven-plugin</artifactId></plugin>',
      'google',
    ],
  ])('finds %s', (_name, file, text, expected) => {
    expect(declaredJavaFormatter(projectWith({ [file]: text }))).toBe(expected);
  });

  it('prefers palantir when both are named and ignores comments', () => {
    const both = 'spotless { java { googleJavaFormat(); palantirJavaFormat() } }';
    const commented =
      '// googleJavaFormat()\n/* palantirJavaFormat() */\nspotless { java { eclipse() } }';

    expect(declaredJavaFormatter(projectWith({ 'build.gradle': both }))).toBe('palantir');
    expect(declaredJavaFormatter(projectWith({ 'build.gradle': commented }))).toBeUndefined();
    expect(declaredJavaFormatter(projectWith({}))).toBeUndefined();
  });
});

describe('checkstyleLineLength', () => {
  it('reads the max of the LineLength module, with or without the package and Check suffix', () => {
    const module = (name) =>
      `<module name="Checker"><module name="TreeWalker"><module name="${name}"><property name="max" value="120"/></module></module></module>`;

    expect(checkstyleLineLength(module('LineLength'))).toBe('120');
    expect(
      checkstyleLineLength(module('com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck')),
    ).toBe('120');
  });

  it('has no answer without a max, a LineLength module or with a commented one', () => {
    expect(
      checkstyleLineLength('<module name="Checker"><module name="LineLength"/></module>'),
    ).toBeUndefined();
    expect(
      checkstyleLineLength('<module name="Checker"><module name="NeedBraces"/></module>'),
    ).toBeUndefined();
    expect(
      checkstyleLineLength(
        '<!-- <module name="LineLength"><property name="max" value="120"/></module> -->',
      ),
    ).toBeUndefined();
  });
});
