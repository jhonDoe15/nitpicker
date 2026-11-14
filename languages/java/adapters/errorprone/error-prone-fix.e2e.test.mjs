import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const { createGitRepository } = useGitFixtures();
const JAVA = 'src/main/java/demo';

const GRADLE_BUILD = {
  'settings.gradle': "rootProject.name = 'jobs'\n",
  'build.gradle': "plugins { id 'java' }\nrepositories { mavenCentral() }\n",
  '.gitignore': 'build/\n.gradle/\ntarget/\n',
};

const MAVEN_BUILD = {
  'pom.xml': `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>jobs</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
</project>
`,
  '.gitignore': 'target/\n',
};

const SOURCE = (name, run) => `package demo;

public class ${name} {
  private String label;

  class Inner {
    int one() {
      return 1;
    }
  }

  static class Base {
    void run() {}
  }

  static class Child extends Base {
    ${run}
  }

  @Override
  public String toString() {
    return "x";
  }
}
`;

function sample(build) {
  const repository = createGitRepository(
    {
      ...build,
      [`${JAVA}/Changed.java`]: SOURCE('Changed', 'void run() { }'),
      [`${JAVA}/Untouched.java`]: SOURCE('Untouched', 'void run() {}'),
    },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { [`${JAVA}/Changed.java`]: SOURCE('Changed', 'void run() {}') });
  return repository;
}

function fix(repository, selectedRules) {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    headPolicy: { exclude: [], conventions: { 'java.formatter': 'none' } },
    config: { preset: 'java' },
    environment: {
      NITPICKER_GRADLE: process.env.NITPICKER_GRADLE ?? '',
      NITPICKER_MAVEN: process.env.NITPICKER_MAVEN ?? '',
    },
    selectedRules,
  });
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

describe.skipIf(!enabled).each([
  ['Gradle', GRADLE_BUILD],
  ['Maven', MAVEN_BUILD],
])('--fix applies Error Prone suggested fixes on %s', (_name, build) => {
  it('fixes the changed file for the safe checks and leaves the untouched file byte-identical', () => {
    const repository = sample(build);
    const untouched = read(repository, `${JAVA}/Untouched.java`);

    const result = fix(repository);

    expect(result.toolErrors).toEqual([]);
    expect(read(repository, `${JAVA}/Changed.java`)).toBe(
      SOURCE('Changed', '@Override void run() {}'),
    );
    expect(read(repository, `${JAVA}/Untouched.java`)).toBe(untouched);
    expect(result.fixedFindings).toEqual([
      `${JAVA}/Changed.java:17 errorprone/MissingOverride (java-error-prone-safe)`,
    ]);
  });

  it('applies a review check only when its rule is selected', () => {
    const repository = sample(build);
    writeFiles(repository.root, {
      [`${JAVA}/Changed.java`]: SOURCE('Changed', 'void run() {}').replace(
        '  class Inner {',
        '  class  Inner {',
      ),
    });

    const plain = fix(repository);
    const selected = fix(repository, ['errorprone/ClassCanBeStatic']);

    expect(plain.fixedFindings).toEqual([
      `${JAVA}/Changed.java:17 errorprone/MissingOverride (java-error-prone-safe)`,
    ]);
    expect(selected.fixedFindings).toEqual([
      `${JAVA}/Changed.java:6 errorprone/ClassCanBeStatic (java-error-prone-review)`,
    ]);
    expect(read(repository, `${JAVA}/Untouched.java`)).toBe(SOURCE('Untouched', 'void run() {}'));
  });
});
