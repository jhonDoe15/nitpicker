import { describe, expect, it } from 'vitest';
import { declaredJavaFormatter } from '../java-formatter-detection.mjs';

function declared(files) {
  return declaredJavaFormatter({
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  }).declared;
}

const SPRING = { formatter: 'spring', aosp: false };
const POM = (plugin) => `<project><build><plugins>${plugin}</plugins></build></project>`;
const SPRING_PLUGIN =
  '<plugin><groupId>io.spring.javaformat</groupId><artifactId>spring-javaformat-maven-plugin</artifactId>' +
  '<version>0.0.43</version><executions><execution><phase>validate</phase>' +
  '<goals><goal>validate</goal></goals></execution></executions></plugin>';

describe('Spring Java Format in the build files', () => {
  it.each([
    ['the Maven plugin', 'pom.xml', POM(SPRING_PLUGIN)],
    [
      'the Gradle plugin in Groovy',
      'build.gradle',
      "plugins { id 'io.spring.javaformat' version '0.0.43' }",
    ],
    [
      'the Gradle plugin in Kotlin DSL',
      'build.gradle.kts',
      'plugins { id("io.spring.javaformat") version "0.0.43" }',
    ],
    ['the legacy apply syntax', 'build.gradle', "apply plugin: 'io.spring.javaformat'"],
    [
      'the plugin applied next to its buildscript classpath',
      'build.gradle',
      "buildscript { dependencies { classpath 'io.spring.javaformat:spring-javaformat-gradle-plugin:0.0.43' } }\napply plugin: 'io.spring.javaformat'",
    ],
    ['the Kotlin apply call', 'build.gradle.kts', 'apply(plugin = "io.spring.javaformat")'],
    [
      'the version catalog',
      'gradle/libs.versions.toml',
      '[plugins]\nspring-format = { id = "io.spring.javaformat", version = "0.0.43" }',
    ],
  ])('is found in %s', (_name, file, text) => {
    expect(declared({ [file]: text })).toEqual(SPRING);
  });

  it.each([
    [
      'a dependency on its checkstyle rules',
      'build.gradle',
      "dependencies { checkstyle 'io.spring.javaformat:spring-javaformat-checkstyle:0.0.43' }",
    ],
    [
      'a buildscript classpath that never applies the plugin',
      'build.gradle',
      "buildscript { dependencies { classpath 'io.spring.javaformat:spring-javaformat-gradle-plugin:0.0.43' } }",
    ],
    [
      'a plugin declared with apply false',
      'build.gradle',
      "plugins { id 'io.spring.javaformat' version '0.0.43' apply false }",
    ],
    [
      'a library of the version catalog',
      'gradle/libs.versions.toml',
      'sjf = "io.spring.javaformat:spring-javaformat-checkstyle:0.0.43"',
    ],
    [
      'a plugin only in pluginManagement',
      'pom.xml',
      POM('').replace(
        '<plugins></plugins>',
        `<pluginManagement><plugins>${SPRING_PLUGIN}</plugins></pluginManagement>`,
      ),
    ],
    [
      'a plugin only in reporting',
      'pom.xml',
      `<project><reporting><plugins>${SPRING_PLUGIN}</plugins></reporting></project>`,
    ],
    [
      'a dependency in a pom',
      'pom.xml',
      '<project><dependencies><dependency><artifactId>spring-javaformat-maven-plugin</artifactId></dependency></dependencies></project>',
    ],
  ])('is not found in %s', (_name, file, text) => {
    expect(declared({ [file]: text })).toBeUndefined();
  });

  it('counts a plugin in pluginManagement that the build plugins also name', () => {
    const managed = `<pluginManagement><plugins>${SPRING_PLUGIN}</plugins></pluginManagement>`;
    const used =
      '<plugins><plugin><artifactId>spring-javaformat-maven-plugin</artifactId></plugin></plugins>';
    expect(declared({ 'pom.xml': `<project><build>${managed}${used}</build></project>` })).toEqual(
      SPRING,
    );
  });

  it('is not found in a comment, and does not hide a formatter that nitpicker runs', () => {
    expect(
      declared({ 'build.gradle': "// id 'io.spring.javaformat'\nplugins {}" }),
    ).toBeUndefined();
    expect(
      declared({
        'build.gradle':
          "plugins { id 'io.spring.javaformat' }\nspotless { java { googleJavaFormat() } }",
      }),
    ).toEqual({ formatter: 'google', aosp: false });
  });

  it('wins over a Spotless formatter that nitpicker does not run', () => {
    expect(
      declared({
        'build.gradle': "plugins { id 'io.spring.javaformat' }\nspotless { java { eclipse() } }",
      }),
    ).toEqual(SPRING);
  });

  it('is the plurality of several build files', () => {
    expect(
      declared({
        'pom.xml': POM(SPRING_PLUGIN),
        'api/pom.xml': POM(SPRING_PLUGIN),
        'web/pom.xml': POM(''),
      }),
    ).toEqual(SPRING);
  });
});
