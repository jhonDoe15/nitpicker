import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { fakeJvmTools } from '../test-support/fake-jvm-tools.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const JAVA = 'src/main/java/demo';
const KT = 'src/main/kotlin/demo';
const BUILDS = {
  gradle: { 'build.gradle': "plugins { id 'java' }\n" },
  maven: { 'pom.xml': '<project/>\n' },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function fixTopic(base, changes, config, extra = {}) {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(base, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: fakeJvmTools().executeFixCommand,
    headPolicy: { exclude: [], conventions: {}, kotlin: { formatter: 'ktlint' } },
    config,
    environment: { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' },
    ...extra,
  });
  return { result, read: (name) => readFileSync(path.join(repository.root, name), 'utf8') };
}

describe('--fix runs the JVM recipes before the formatter', () => {
  it.each(Object.entries(BUILDS))('fixes lowercase long suffixes on %s', (_, build) => {
    const { result, read } = fixTopic(
      build,
      { [`${JAVA}/New.java`]: 'class  New { long a = 1l; String s = "2l"; }\n' },
      { preset: 'java' },
    );

    expect(read(`${JAVA}/New.java`)).toBe('class New { long a = 1L; String s = "2l"; }\n');
    expect(result).toEqual({
      fixedFiles: [`${JAVA}/New.java`],
      fixedFindings: [`${JAVA}/New.java:1 checkstyle/UpperEll (java-upper-ell)`],
      toolErrors: [],
      notes: [`google-java-format rewrote ${JAVA}/New.java`],
    });
  });
  it('ends a Kotlin file with a line break and leaves Java long suffixes to the java preset', () => {
    const { result, read } = fixTopic(
      BUILDS.gradle,
      { [`${KT}/New.kt`]: 'class New', [`${JAVA}/J.java`]: 'class J { long a = 1l; }\n' },
      { preset: 'kotlin' },
    );

    expect([read(`${KT}/New.kt`), read(`${JAVA}/J.java`)]).toEqual([
      'class New\n',
      'class J { long a = 1l; }\n',
    ]);
    expect(result.fixedFindings).toEqual([
      `${KT}/New.kt:1 detekt/detekt.style.NewLineAtEndOfFile (kotlin-final-newline)`,
    ]);
  });
  it.each(Object.entries(BUILDS))('applies the Kotlin source recipes on %s', (_, build) => {
    const source = [
      'package demo',
      '',
      'private val NAME = "demo"',
      '',
      'fun verify(values: List<String>?, size: Int) {',
      '    var total = 0',
      '    if (size < 0) throw IllegalArgumentException("negative")',
      '    println(total + NAME.length)',
      '}',
      '',
    ].join('\n');
    const { result, read } = fixTopic(build, { [`${KT}/New.kt`]: source }, { preset: 'kotlin' });

    const lines = read(`${KT}/New.kt`)
      .split('\n')
      .map((line) => line.trim());

    expect(lines).toEqual([
      'package demo',
      '',
      'private const val NAME = "demo"',
      '',
      'fun verify(values: List<String>?, size: Int) {',
      'val total = 0',
      'require(!(size < 0)) { "negative" }',
      'println(total + NAME.length)',
      '}',
      '',
    ]);
    expect(result.fixedFindings).toEqual([
      `${KT}/New.kt:7 detekt/detekt.style.UseRequire (kotlin-use-require)`,
      `${KT}/New.kt:6 detekt/detekt.style.VarCouldBeVal (kotlin-var-could-be-val)`,
      `${KT}/New.kt:3 detekt/detekt.style.MayBeConst (kotlin-may-be-const)`,
    ]);
  });
  it('fixes nothing in a file outside the source sets', () => {
    const { result, read } = fixTopic(
      BUILDS.gradle,
      { 'scripts/Tool.java': 'class Tool { long a = 1l; }\n' },
      { preset: 'java' },
    );

    expect(read('scripts/Tool.java')).toBe('class Tool { long a = 1l; }\n');
    expect(result.fixedFindings).toBeUndefined();
  });
  it.each(Object.entries(BUILDS))(
    'runs the Spring recipes on changed config files only when the rule is selected (%s)',
    (_, build) => {
      const name = 'src/main/resources/application.yml';
      const text = 'spring:\n  jpa:\n    hibernate:\n      ddl-auto: update\n';
      const files = { [name]: text, [`${JAVA}/New.java`]: 'class  New {}\n' };
      const untouched = fixTopic(build, files, { preset: 'java' });
      const fixed = fixTopic(
        build,
        files,
        { preset: 'kotlin' },
        { selectedRules: ['spring/ddl-auto'] },
      );

      expect(untouched.read(name)).toBe(text);
      expect(fixed.read(name)).toBe(text.replace('update', 'validate'));
      expect(fixed.result.fixedFiles).toEqual([name]);
      expect(fixed.read(`${JAVA}/New.java`)).toBe('class  New {}\n');
      expect(fixed.result.fixedFindings).toEqual([`${name}:4 spring/ddl-auto (spring-ddl-auto)`]);
      expect(fixed.result.notes.join('\n')).not.toContain('application.yml');
    },
  );
});
