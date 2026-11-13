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

function fixTopic(base, changes, config) {
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
  it('fixes nothing in a file outside the source sets', () => {
    const { result, read } = fixTopic(
      BUILDS.gradle,
      { 'scripts/Tool.java': 'class Tool { long a = 1l; }\n' },
      { preset: 'java' },
    );

    expect(read('scripts/Tool.java')).toBe('class Tool { long a = 1l; }\n');
    expect(result.fixedFindings).toBeUndefined();
  });
});
