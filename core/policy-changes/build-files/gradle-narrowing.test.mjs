import { describe, expect, it } from 'vitest';
import { between } from './test-support/policy-fixtures.mjs';

const CLASS = 'package a;\nclass A {}\n';
const SOURCES = {
  'src/main/java/a/A.java': CLASS,
  'src/main/java/b/B.java': CLASS,
  'src/test/java/a/slow/SlowTest.java': CLASS,
  'src/test/java/a/FastTest.java': CLASS,
};
const groovy = (script) => ({ 'build.gradle': `plugins { id 'java' }\n${script}`, ...SOURCES });
const kotlin = (script) => ({ 'build.gradle.kts': `plugins { java }\n${script}`, ...SOURCES });
const loosenedBy = (files, head) =>
  between({ base: files(''), head: files(head) }).policyLoosenings;

describe('Gradle test task filters written outside a task block', () => {
  it.each([
    ['a Groovy one-line switch-off', groovy, 'test.enabled = false\n'],
    ['a Kotlin get().enabled', kotlin, 'tasks.test.get().enabled = false\n'],
    ['a getByName lookup', kotlin, 'tasks.getByName("test").enabled = false\n'],
    ['an onlyIf that is always false', kotlin, 'tasks.test { onlyIf { false } }\n'],
  ])('counts %s as switching the tests off', (_, files, head) => {
    expect(loosenedBy(files, head)).toEqual([
      `Gradle test excludes in ${Object.keys(files(''))[0]} added: enabled = false`,
    ]);
  });

  it.each([
    ['test.exclude', groovy, "test.exclude '**/slow/**'\n"],
    ['tasks.test.configure', kotlin, 'tasks.test.configure { exclude("**/slow/**") }\n'],
  ])('counts an exclude written with %s', (_, files, head) => {
    expect(loosenedBy(files, head)).toEqual([
      `Gradle test excludes in ${Object.keys(files(''))[0]} added: **/slow/**`,
    ]);
  });
});

describe('Gradle include filters', () => {
  it.each([
    [
      'includeTestsMatching',
      kotlin,
      'tasks.test { filter { includeTestsMatching("*FastTest") } }\n',
    ],
    ['include', groovy, "test { include '**/FastTest*' }\n"],
  ])('counts a test %s that leaves a test out', (_, files, head) => {
    expect(loosenedBy(files, head)).toEqual([
      `Gradle test includes in ${Object.keys(files(''))[0]} leave out checked code: src/test/java/a/slow/SlowTest.java`,
    ]);
  });

  it('counts included tags, which leave out every test without the tag', () => {
    expect(loosenedBy(kotlin, 'tasks.test { useJUnitPlatform { includeTags("fast") } }\n')).toEqual(
      [
        'Gradle test includes in build.gradle.kts leave out checked code: src/test/java/a/FastTest.java, src/test/java/a/slow/SlowTest.java',
      ],
    );
  });

  it('scopes a main source set include to main code and a test compile include to tests', () => {
    expect(loosenedBy(groovy, "sourceSets { main { java { include 'a/**' } } }\n")).toEqual([
      'Gradle source set includes in build.gradle leave out checked code: src/main/java/b/B.java',
    ]);
    expect(loosenedBy(groovy, "compileTestJava { include 'a/slow/**' }\n")).toEqual([
      'Gradle compile includes in build.gradle leave out checked code: src/test/java/a/FastTest.java',
    ]);
  });

  it('lists an include that still admits every checked file without counting it', () => {
    expect(loosenedBy(groovy, "test { include '**/*Test*' }\n")).toEqual([]);
  });
});

describe('Gradle compile excludes', () => {
  it.each([
    ['compileJava', 'tasks.compileJava { exclude("a/A.java") }\n', 'a/A.java'],
    [
      'withType<JavaCompile>',
      'tasks.withType<JavaCompile> { exclude("**/A.java") }\n',
      '**/A.java',
    ],
  ])('counts a %s exclude that covers main code', (_, head, pattern) => {
    expect(loosenedBy(kotlin, head)).toEqual([
      `Gradle compile excludes in build.gradle.kts added: ${pattern}`,
    ]);
  });

  it('scopes a test source set exclude to the tests and a main one to main code', () => {
    expect(loosenedBy(groovy, "sourceSets { test { java { exclude '**/slow/**' } } }\n")).toEqual([
      'Gradle source set excludes in build.gradle added: **/slow/**',
    ]);
    expect(loosenedBy(groovy, "sourceSets { main { java { exclude '**/slow/**' } } }\n")).toEqual(
      [],
    );
  });
});

describe('Gradle settings that nitpicker does not run', () => {
  it.each([
    ['a dependency exclude', 'dependencies { implementation("x:y:1") { exclude(group = "a") } }\n'],
    ['a configuration exclude', 'configurations.all { exclude(group = "commons-logging") }\n'],
    [
      'a JaCoCo exclude',
      'tasks.test { extensions.configure(JacocoTaskExtension::class) { excludes = listOf("a.A") } }\n',
    ],
    ['a test resources exclude', 'sourceSets { test { resources { exclude("**/slow/**") } } }\n'],
    [
      'an extra Test task',
      'val integrationTest by tasks.registering(Test::class) { exclude("**/slow/**") }\ntasks.register<Test>("other") { exclude("**/slow/**") }\n',
    ],
  ])('ignores %s', (_, head) => {
    expect(loosenedBy(kotlin, head)).toEqual([]);
  });
});

describe('switching the build tool', () => {
  const pom =
    '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>a</artifactId><version>1</version></project>';

  it('counts nothing when Maven gives way to Gradle or Groovy to Kotlin DSL on the same roots', () => {
    const maven = { 'pom.xml': pom, ...SOURCES };

    expect(between({ base: maven, head: groovy('') }).policyLoosenings).toEqual([]);
    expect(between({ base: groovy(''), head: maven }).policyLoosenings).toEqual([]);
    expect(between({ base: groovy(''), head: kotlin('') }).policyLoosenings).toEqual([]);
  });

  it('still counts a switch that drops a root holding checked code', () => {
    const custom = groovy("sourceSets { main { java { srcDirs = ['src/main/java', 'lib'] } } }\n");
    const head = { 'pom.xml': pom, ...SOURCES };

    expect(
      between({
        base: { ...custom, 'lib/c/C.java': CLASS },
        head: { ...head, 'lib/c/C.java': CLASS },
      }).policyLoosenings,
    ).toEqual([
      'Gradle source set main in build.gradle no longer includes checked code: lib/c/C.java',
    ]);
  });
});
