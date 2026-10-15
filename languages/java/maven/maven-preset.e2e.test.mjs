import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../adapters/java-diff.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS as STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from '../adapters/fixtures/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const maven = process.env.NITPICKER_MAVEN ?? 'mvn';
const fixtures = path.resolve(import.meta.dirname, 'fixtures');
const gradleFixture = path.resolve(import.meta.dirname, '../adapters/fixtures/gradle-project');

const GREETER = `package demo;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + name + "!";
  }

  public String shout(String name) {
    return name.trim().toUpperCase(java.util.Locale.ROOT);
  }

  /** Says goodbye. */
  public String farewell(String name) {
    return "Goodbye, " + name + ".";
  }
}
`;

const GREETER_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greetsByName() {
    assertEquals("Hello, Ada!", new Greeter().greet("Ada"));
  }

  @Test
  void saysFarewell() {
    assertEquals("Goodbye, Ada.", new Greeter().farewell("Ada"));
  }
}
`;

const BAD = `package demo;

public final class Bad {
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
        public void sloppy() { }
}
`;

const STAMP = `package demo;

import java.util.Date;

public final class Stamp {
  public long now() {
    return new Date().getTime();
  }

  public static final class Inner {
    public long later() {
      return new Date().getTime() + 1;
    }
  }
}
`;

const CHECKSTYLE_PREFIX = 'com.puppycrawl.tools.checkstyle.checks.';
const CHECKSTYLE_ON_BAD = [
  'blocks.EmptyCatchBlockCheck',
  'indentation.IndentationCheck',
  'regexp.RegexpSinglelineJavaCheck',
  'whitespace.EmptyLineSeparatorCheck',
];

const javaFile = (module, name, body) => ({
  [`${module}/src/main/java/${module}/${name}.java`]: `package ${module};

public final class ${name} {
${body}
}
`,
});

let repository;
let modules;

function git(...args) {
  runGitIn(repository, ...args);
}

function writeProject(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

describe.skipIf(!enabled)('Java preset on Maven end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
    cpSync(path.join(gradleFixture, 'src'), path.join(repository, 'src'), { recursive: true });
    cpSync(path.join(fixtures, 'pom.xml'), path.join(repository, 'pom.xml'));
    writeFileSync(path.join(repository, '.gitignore'), 'target/\n');
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    commitBranch(repository, 'clean', {
      'src/main/java/demo/Greeter.java': GREETER,
      'src/test/java/demo/GreeterTest.java': GREETER_TEST,
    });
    commitBranch(repository, 'violation', { 'src/main/java/demo/Bad.java': BAD });
    commitBranch(repository, 'architecture', { 'src/main/java/demo/Stamp.java': STAMP });

    modules = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-modules-e2e-'));
    const moduleFiles = (name) =>
      readFileSync(path.join(fixtures, 'module-pom.xml'), 'utf8').replace('MODULE', name);
    writeProject(modules, {
      'pom.xml': readFileSync(path.join(fixtures, 'multi-pom.xml'), 'utf8'),
      'lib/pom.xml': moduleFiles('lib'),
      'app/pom.xml': moduleFiles('app'),
      ...javaFile('lib', 'Library', '  public int one() {\n    return 1;\n  }'),
      ...javaFile('app', 'Application', '  public int two() {\n    return 2;\n  }'),
      '.gitignore': 'target/\n',
    });
    runGitIn(modules, 'init', '-q', '-b', 'main');
    runGitIn(modules, 'add', '-A');
    runGitIn(modules, 'commit', '-q', '-m', 'base');
    commitBranch(modules, 'lib-violation', {
      'lib/src/main/java/lib/Bad.java': BAD.replace('package demo;', 'package lib;'),
    });
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
    rmSync(modules, { recursive: true, force: true });
  });

  const diffOf = (root, branch, policy) => {
    runGitIn(root, 'checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: root, requestedBaseRef: 'main', maven, policy });
  };

  it(
    'passes a clean, tested change although the pom sets an argLine and a PMD ruleset of its own',
    () => {
      const result = diffOf(repository, 'clean');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    'fails new PMD, SpotBugs, Checkstyle and formatter violations and untested code, as the Gradle build does',
    () => {
      const result = diffOf(repository, 'violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...CHECKSTYLE_ON_BAD.map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check} Bad.java`),
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java',
        'pmd EmptyCatchBlock Bad.java',
        'spotbugs DM_DEFAULT_ENCODING Bad.java',
      ]);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    'fails a new ArchUnit violation from the second test run, once per offending class',
    () => {
      const result = diffOf(repository, 'architecture');

      expect(result.failed).toBe(true);
      expect(
        result.newEnforceable
          .filter((finding) => finding.tool === 'archunit')
          .map((finding) => finding.identity)
          .sort(),
      ).toEqual(['demo.Stamp', 'demo.Stamp$Inner']);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    'analyzes every module and prefixes finding paths with the module folder',
    () => {
      const result = diffOf(modules, 'lib-violation');

      expect(result.failed).toBe(true);
      const paths = result.newEnforceable.map((finding) => finding.path);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((file) => file === 'lib/src/main/java/lib/Bad.java')).toBe(true);
      expect(summarize(result.newEnforceable)).toContain('pmd EmptyCatchBlock Bad.java');
    },
    STEP_TIMEOUT_MS,
  );
});
