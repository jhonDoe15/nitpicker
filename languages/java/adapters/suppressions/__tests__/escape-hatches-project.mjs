import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import { commitBranch, runGitIn, summarize } from '../../test-support/gradle-e2e.mjs';

export const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../fixtures/gradle-project');

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
  <module name="TreeWalker">
    <module name="FinalParameters"/>
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
  // This comment runs past the 100 columns of the Java line length, which nothing else reports here.
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

export function ofTool(result, tool) {
  return summarize(result.newEnforceable.filter((finding) => finding.tool === tool));
}

export function ofFile(result, file) {
  return summarize(result.newEnforceable.filter((finding) => path.basename(finding.path) === file));
}

export function useEscapeHatchProject() {
  let repository;
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
    rmSync(repository, { recursive: true, force: true });
  });
  return {
    get repository() {
      return repository;
    },
    diffOf(policy) {
      return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
    },
  };
}
