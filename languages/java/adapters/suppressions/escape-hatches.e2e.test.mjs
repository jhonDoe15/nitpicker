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
} from '../test-support/gradle-e2e.mjs';

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

const PROJECT_CHECKSTYLE_CONFIG = `<?xml version="1.0"?>
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
  "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="SuppressionFilter">
    <property name="file" value="\${config_loc}/suppressions.xml"/>
  </module>
  <module name="LineLength">
    <property name="max" value="200"/>
  </module>
</module>
`;

const PROJECT_CHECKSTYLE_SUPPRESSIONS = `<?xml version="1.0"?>
<!DOCTYPE suppressions PUBLIC "-//Checkstyle//DTD SuppressionFilter Configuration 1.2//EN"
  "https://checkstyle.org/dtds/suppressions_1_2.dtd">
<suppressions>
  <suppress checks="NoSuchCheck" files="Nothing\\.java"/>
</suppressions>
`;

const GRADLE_PROPERTIES_OPT_IN = [
  'nitpicker.pmd.projectConfig=config/pmd/ruleset.xml',
  'nitpicker.checkstyle.projectConfig=config/checkstyle/checkstyle.xml',
  '',
].join('\n');

const SWALLOWING_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SwallowingTest {
  // This comment runs past the 100 columns of Checkstyle's line length, which nothing else reports here.
  @Test
  void parses() {
    try {
      assertEquals(1, Integer.parseInt("1"));
      assertEquals(2,  Integer.parseInt("2"));
    } catch (Exception e) {
    }
  }

  @Test
  void runs() {
    Integer.parseInt("3");
  }
}
`;

let repository;

const ofTool = (result, tool) =>
  summarize(result.newEnforceable.filter((finding) => finding.tool === tool));

const ofFile = (result, file) =>
  summarize(result.newEnforceable.filter((finding) => path.basename(finding.path) === file));

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
      'config/checkstyle/checkstyle.xml': PROJECT_CHECKSTYLE_CONFIG,
      'config/checkstyle/suppressions.xml': PROJECT_CHECKSTYLE_SUPPRESSIONS,
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
  let defaultResult;
  const defaultDiff = () => (defaultResult ??= diffOf());

  it(
    "ignores inline Checkstyle suppressions and the project's configs without an opt-in",
    () => {
      const result = defaultDiff();

      expect(result.failed).toBe(true);
      expect(ofFile(result, 'Bad.java')).toEqual([
        ...['EmptyLineSeparator', 'Indentation', 'RegexpSinglelineJava'].map(
          (check) => `checkstyle ${check} Bad.java`,
        ),
        'errorprone DefaultCharset Bad.java',
        'errorprone EmptyCatch Bad.java',
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lints test sources with PMD, Checkstyle and the formatter, without the assertion-style rules',
    () => {
      expect(ofFile(defaultDiff(), 'SwallowingTest.java')).toEqual([
        'checkstyle LineLength SwallowingTest.java',
        'errorprone EmptyCatch SwallowingTest.java',
        'google-java-format format SwallowingTest.java',
        'pmd AvoidCatchingGenericException SwallowingTest.java',
        'pmd UnitTestShouldIncludeAssert SwallowingTest.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    "adds the project's PMD rules to nitpicker's when tools.pmd opts in",
    () => {
      const result = diffOf({ policyRoot: repository, toolPrecedence: { pmd: ['project'] } });

      expect(ofTool(result, 'pmd')).toEqual([
        'pmd AvoidCatchingGenericException SwallowingTest.java',
        'pmd MethodArgumentCouldBeFinal Bad.java',
        'pmd UnitTestShouldIncludeAssert SwallowingTest.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    "lays the project's Checkstyle config over nitpicker's when tools.checkstyle opts in",
    () => {
      const result = diffOf({
        policyRoot: repository,
        toolPrecedence: { checkstyle: ['project'] },
      });

      expect(ofTool(result, 'checkstyle')).toEqual([
        ...['EmptyLineSeparator', 'Indentation', 'RegexpSinglelineJava'].map(
          (check) => `checkstyle ${check} Bad.java`,
        ),
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
