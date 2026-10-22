import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../adapters/java-diff.mjs';
import { commitBranch, runGitIn, summarize } from '../../adapters/test-support/gradle-e2e.mjs';

const maven = process.env.NITPICKER_MAVEN;
const gradleFixture = path.join(import.meta.dirname, '../../adapters/fixtures/gradle-project');
const pom = path.join(import.meta.dirname, '../fixtures/single');
const TEST_PATH = 'src/test/java/demo/GreeterTest.java';

const BAD = `package demo;

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

function createRedBaseRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-red-base-e2e-'));
  cpSync(gradleFixture, root, { recursive: true });
  cpSync(pom, root, { recursive: true });
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(root, name));
  }
  const passing = readFileSync(path.join(root, TEST_PATH), 'utf8');
  writeFileSync(path.join(root, '.gitignore'), 'target/\n');
  writeFileSync(path.join(root, TEST_PATH), passing.replace('"Hello, Ada!"', '"Hi, Ada!"'));
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'main');
  commitBranch(root, 'repaired', { [TEST_PATH]: passing });
  commitBranch(root, 'repaired-with-violation', {
    [TEST_PATH]: passing,
    'src/main/java/demo/Bad.java': BAD,
  });
  commitBranch(root, 'still-red', {
    'src/main/java/demo/Extra.java': 'package demo;\n\nfinal class Extra {}\n',
  });
  return root;
}

function diffOf(root, branch) {
  runGitIn(root, 'checkout', '-q', branch);
  return runJavaDiff({
    repositoryRoot: root,
    requestedBaseRef: 'main',
    maven,
    policy: { preset: 'java' },
  });
}

describe.skipIf(process.env.NITPICKER_JAVA_E2E !== '1')(
  'Java preset on a Maven base whose tests fail',
  () => {
    let root;

    beforeAll(() => {
      root = createRedBaseRepository();
    });

    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('does not block a change that repairs the failing base tests', () => {
      const result = diffOf(root, 'repaired');

      expect({
        failed: result.failed,
        newEnforceable: summarize(result.newEnforceable),
        notes: result.notes.map(({ tool, rule, message }) => ({ tool, rule, message })),
      }).toEqual({
        failed: false,
        newEnforceable: [],
        notes: [
          {
            tool: 'java',
            rule: 'tests-failed',
            message: expect.stringMatching(
              /^Tests fail in .*:\n {2}demo\.GreeterTest\.greetsByName: /u,
            ),
          },
        ],
      });
    });

    it('still fails a new violation next to a failing base', () => {
      const result = diffOf(root, 'repaired-with-violation');

      expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
        failed: true,
        newEnforceable: [
          'errorprone DefaultCharset Bad.java',
          'errorprone EmptyCatch Bad.java',
          'pit mutant-nocoverage Bad.java',
        ],
      });
    });

    it('fails a head whose tests still fail', () => {
      expect(() => diffOf(root, 'still-red')).toThrow(
        /^Tests fail in .*; nitpicker needs a passing test suite/u,
      );
    });
  },
);
