import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runGitIn, summarize } from '../fixtures/gradle-e2e.mjs';
import { runJavaDiff } from '../java-diff.mjs';

// End-to-end tests of a change that repairs a base whose tests fail, with real Gradle. They need
// Java 21, Gradle and network access like the Java and Kotlin suites, and run with
// NITPICKER_JAVA_E2E=1 (`npm run test:java`) and NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../fixtures');

const JAVA_LEGACY = `package demo;

public final class Legacy {
  private int leftover;

  public int value() {
    return 1;
  }
}
`;

const JAVA_BAD = `package demo;

public final class Bad {
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
}
`;

const KOTLIN_BAD = `package demo

class Bad {
    fun compute(a: Int, b: Int): Int {
        if (a > b) {
            return a
        }
        return b
    }
}
`;

function createRepository({ fixture, ignored, files }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-e2e-'));
  cpSync(path.join(fixtures, fixture), root, { recursive: true });
  writeAll(root, { '.gitignore': ignored, ...files });
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'main');
  return root;
}

function writeAll(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function branchFrom(root, { name, from, files }) {
  runGitIn(root, 'checkout', '-q', '-b', name, from);
  writeAll(root, files);
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', name);
}

function addRedBaseBranches(root, { testPath, bad }) {
  const passing = readFileSync(path.join(root, testPath), 'utf8');
  branchFrom(root, {
    name: 'red-base',
    from: 'main',
    files: { [testPath]: passing.replace('"Hello, Ada!"', '"Hi, Ada!"') },
  });
  branchFrom(root, { name: 'repaired', from: 'red-base', files: { [testPath]: passing } });
  branchFrom(root, { name: 'repaired-with-violation', from: 'repaired', files: bad });
}

function diffOf(root, branch, policy) {
  runGitIn(root, 'checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: root, requestedBaseRef: 'red-base', gradle, policy });
}

function describeRedBase({ title, enabled, setup, policy, expected }) {
  describe.skipIf(!enabled)(title, () => {
    let root;

    beforeAll(() => {
      root = setup();
    });

    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('does not block a change that repairs the failing base tests, and keeps comparing the other checks with the base', () => {
      const result = diffOf(root, 'repaired', policy);

      expect({
        failed: result.failed,
        newEnforceable: summarize(result.newEnforceable),
        notes: result.notes.map(({ tool, rule }) => `${tool} ${rule}`),
        legacy: summarize(result.unchangedFindings).filter((entry) => entry === expected.legacy),
      }).toEqual({
        failed: false,
        newEnforceable: [],
        notes: [`${policy.preset} tests-failed`],
        legacy: [expected.legacy],
      });
    });

    it('still fails a new violation next to a failing base', () => {
      const result = diffOf(root, 'repaired-with-violation', policy);

      expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
        failed: true,
        newEnforceable: expected.violation,
      });
    });
  });
}

describeRedBase({
  title: 'Java preset on a base whose tests fail',
  enabled: process.env.NITPICKER_JAVA_E2E === '1',
  policy: { preset: 'java' },
  setup: () => {
    const root = createRepository({
      fixture: 'gradle-project',
      ignored: 'build/\n.gradle/\n',
      files: { 'src/main/java/demo/Legacy.java': JAVA_LEGACY },
    });
    addRedBaseBranches(root, {
      testPath: 'src/test/java/demo/GreeterTest.java',
      bad: { 'src/main/java/demo/Bad.java': JAVA_BAD },
    });
    return root;
  },
  expected: {
    legacy: 'pmd UnusedPrivateField Legacy.java',
    violation: [],
  },
});

describeRedBase({
  title: 'Kotlin preset on a base whose tests fail',
  enabled: process.env.NITPICKER_KOTLIN_E2E === '1',
  policy: { preset: 'kotlin' },
  setup: () => {
    const root = createRepository({
      fixture: 'kotlin-project',
      ignored: '/build/\n/.gradle/\n/.kotlin/\n',
      files: {},
    });
    addRedBaseBranches(root, {
      testPath: 'src/test/kotlin/demo/GreeterTest.kt',
      bad: { 'src/main/kotlin/demo/Bad.kt': KOTLIN_BAD },
    });
    return root;
  },
  expected: {
    legacy: 'detekt UnusedPrivateProperty Legacy.kt',
    violation: [],
  },
});
