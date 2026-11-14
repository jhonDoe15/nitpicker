import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commit,
  fixtureGit,
  useGitFixtures,
} from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../../core/fix/run-fix.mts';
import { OWN_CHECKS } from '../../../fix/errorprone/own/own-checks.mjs';

const TIMEOUT = 180_000;
const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const { createGitRepository } = useGitFixtures();
const INPUT = path.join(import.meta.dirname, 'fixtures', 'input');
const EXPECTED = path.join(import.meta.dirname, 'fixtures', 'expected');

const GRADLE_BUILD = {
  'settings.gradle': "rootProject.name = 'own'\n",
  'build.gradle': "plugins { id 'java' }\nrepositories { mavenCentral() }\n",
  '.gitignore': 'build/\n.gradle/\ntarget/\n',
};

const MAVEN_BUILD = {
  'pom.xml': `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>own</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
</project>
`,
  '.gitignore': 'target/\n',
};

function treeOf(root) {
  const pending = [''];
  const files = {};
  for (const directory of pending) {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(relative);
      } else {
        files[relative.split(path.sep).join('/')] = readFileSync(path.join(root, relative), 'utf8');
      }
    }
  }
  return files;
}

function sample(build) {
  const repository = createGitRepository(build, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, treeOf(INPUT));
  commit(repository.root, 'Add the sources');
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

const byText = (left, right) => left.localeCompare(right);
const RULES = OWN_CHECKS.map(({ tool, check }) => `${tool}/${check}`);
const SAFE = OWN_CHECKS.filter(({ safety }) => safety === 'safe').map(
  ({ check }) => `pmd/${check}`,
);
const WIRE = 'src/main/java/demo/Wire.java';

function reportedRules(result) {
  return [...new Set(result.fixedFindings.map((line) => line.split(' ')[1]))].toSorted(byText);
}

describe.skipIf(!enabled).each([
  ['Gradle', GRADLE_BUILD],
  ['Maven', MAVEN_BUILD],
])('the fix-only Java checks on %s', (_name, build) => {
  it(
    'rewrite the sources for every rule and report the PMD finding each one clears',
    () => {
      const repository = sample(build);

      const result = fix(repository, RULES);

      const expected = treeOf(EXPECTED);
      const fixed = treeOf(repository.root);
      expect(result.toolErrors).toEqual([]);
      expect(Object.fromEntries(Object.keys(expected).map((name) => [name, fixed[name]]))).toEqual(
        expected,
      );
      expect(reportedRules(result).filter((rule) => rule.startsWith('pmd/'))).toEqual(
        RULES.toSorted(byText),
      );
    },
    TIMEOUT,
  );

  it(
    'apply only the safe rewrites when no rule is selected',
    () => {
      const repository = sample(build);

      const result = fix(repository, []);

      expect(result.toolErrors).toEqual([]);
      expect(reportedRules(result).filter((rule) => rule.startsWith('pmd/'))).toEqual(
        SAFE.toSorted(byText),
      );
      expect(readFileSync(path.join(repository.root, WIRE), 'utf8')).toBe(treeOf(INPUT)[WIRE]);
    },
    TIMEOUT,
  );
});
