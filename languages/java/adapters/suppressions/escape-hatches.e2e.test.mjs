import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../java-diff.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from '../fixtures/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../fixtures/gradle-project');

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

const PROJECT_PMD_RULESET = `<?xml version="1.0"?>
<ruleset name="project" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <description>Project rules</description>
  <rule ref="category/java/codestyle.xml/MethodArgumentCouldBeFinal"/>
</ruleset>
`;

const EMPTY_CHECKSTYLE_CONFIG = `<?xml version="1.0"?>
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
  "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker"/>
`;

const GRADLE_PROPERTIES_OPT_IN = [
  'nitpicker.pmd.nitpickerConfig=false',
  'nitpicker.pmd.projectConfig=config/pmd/ruleset.xml',
  'nitpicker.checkstyle.projectConfig=config/checkstyle/checkstyle.xml',
  '',
].join('\n');

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

const ofTool = (result, tool) =>
  summarize(result.newEnforceable.filter((finding) => finding.tool === tool));

describe.skipIf(!enabled)('Java preset escape hatches', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-hatches-'));
    cpSync(fixture, repository, { recursive: true });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base');
    commitBranch(repository, 'hatches', {
      'src/main/java/demo/Bad.java': SUPPRESSED,
      'config/pmd/ruleset.xml': PROJECT_PMD_RULESET,
      'config/checkstyle/checkstyle.xml': EMPTY_CHECKSTYLE_CONFIG,
      'gradle.properties': GRADLE_PROPERTIES_OPT_IN,
      'src/test/java/demo/SwallowingTest.java': SWALLOWING_TEST,
    });
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (policy) =>
    runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });

  it(
    "ignores inline Checkstyle suppressions and the project's configs without an opt-in, and lints tests",
    () => {
      const result = diffOf();

      expect(result.failed).toBe(true);
      expect(ofTool(result, 'checkstyle')).toEqual(
        [
          'blocks.EmptyCatchBlockCheck Bad.java',
          'blocks.EmptyCatchBlockCheck SwallowingTest.java',
          'indentation.IndentationCheck Bad.java',
          'regexp.RegexpSinglelineJavaCheck Bad.java',
          'whitespace.EmptyLineSeparatorCheck Bad.java',
        ].map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check}`),
      );
      expect(ofTool(result, 'pmd')).toEqual([
        'pmd AvoidCatchingGenericException SwallowingTest.java',
        'pmd EmptyCatchBlock Bad.java',
        'pmd EmptyCatchBlock SwallowingTest.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    "uses the project's PMD rule set when tools.pmd opts in",
    () => {
      const result = diffOf({ policyRoot: repository, toolPrecedence: { pmd: ['project'] } });

      expect(ofTool(result, 'pmd')).toEqual(['pmd MethodArgumentCouldBeFinal Bad.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
