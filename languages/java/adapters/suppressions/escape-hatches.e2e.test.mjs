import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../java-diff.mjs';

// End-to-end test that a change cannot switch the Java preset's rules off: inline Checkstyle
// suppressions do nothing, a project's own PMD rule set is read only when nitpicker.config.json
// opts in, and test sources are linted like main sources. Same requirements as java-preset.e2e.test.mjs; runs with NITPICKER_JAVA_E2E=1.

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const GRADLE_STEP_TIMEOUT_MS = 15 * 60 * 1000;
const fixture = path.resolve(import.meta.dirname, '../fixtures/gradle-project');

// The same violations as java-preset.e2e.test.mjs's Bad.java, each under an inline suppression.
const SUPPRESSED = `package demo;

public final class Bad {
  @SuppressWarnings("checkstyle:EmptyCatchBlock")
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
        // CHECKSTYLE.SUPPRESS: Indentation
        public void sloppy() { }
}
`;

// A project rule set that would replace nitpicker's PMD rules if it were read without an opt-in.
const PROJECT_PMD_RULESET = `<?xml version="1.0"?>
<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Project rules</description>
  <rule ref="category/java/codestyle.xml/MethodArgumentCouldBeFinal"/>
</ruleset>
`;

// A test that swallows every exception.
const SWALLOWING_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SwallowingTest {
  @Test
  void parses() {
    try {
      assertEquals(1, Integer.parseInt("1"));
    } catch (Exception e) {
    }
  }
}
`;

const CHECKSTYLE_PREFIX = 'com.puppycrawl.tools.checkstyle.checks.';

let repository;

function git(...args) {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

function branchWith(name, files) {
  git('checkout', '-q', '-b', name, 'main');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const ofTool = (result, tool) =>
  summarize(result.newEnforceable.filter((finding) => finding.tool === tool));

describe.skipIf(!enabled)('Java preset escape hatches', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-hatches-'));
    cpSync(fixture, repository, { recursive: true });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    branchWith('suppressed', { 'src/main/java/demo/Bad.java': SUPPRESSED });
    branchWith('project-pmd', {
      'src/main/java/demo/Bad.java': SUPPRESSED,
      'config/pmd/ruleset.xml': PROJECT_PMD_RULESET,
    });
    branchWith('swallowing-test', { 'src/test/java/demo/SwallowingTest.java': SWALLOWING_TEST });
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (branch, policy) => {
    git('checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
  };

  it(
    'reports the Checkstyle violations an inline suppression names',
    () => {
      expect(ofTool(diffOf('suppressed'), 'checkstyle')).toEqual(
        [
          'blocks.EmptyCatchBlockCheck',
          'indentation.IndentationCheck',
          'regexp.RegexpSinglelineJavaCheck',
          'whitespace.EmptyLineSeparatorCheck',
        ].map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check} Bad.java`),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    "uses the project's PMD rule set only when tools.pmd opts in",
    () => {
      expect(ofTool(diffOf('project-pmd'), 'pmd')).toEqual(['pmd EmptyCatchBlock Bad.java']);
      expect(
        ofTool(
          diffOf('project-pmd', { policyRoot: repository, toolPrecedence: { pmd: ['project'] } }),
          'pmd',
        ),
      ).toEqual(['pmd MethodArgumentCouldBeFinal Bad.java']);
    },
    GRADLE_STEP_TIMEOUT_MS * 2,
  );

  it(
    'lints test sources with PMD and Checkstyle like main sources',
    () => {
      const result = diffOf('swallowing-test');

      expect(result.failed).toBe(true);
      expect([...ofTool(result, 'checkstyle'), ...ofTool(result, 'pmd')]).toEqual([
        `checkstyle ${CHECKSTYLE_PREFIX}blocks.EmptyCatchBlockCheck SwallowingTest.java`,
        'pmd AvoidCatchingGenericException SwallowingTest.java',
        'pmd EmptyCatchBlock SwallowingTest.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
