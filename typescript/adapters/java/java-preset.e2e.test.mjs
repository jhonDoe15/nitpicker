import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from './java-diff.mjs';

// End-to-end test of the Java preset on a tiny Gradle project. It needs Java 21, Gradle and network
// access to Maven Central (first run downloads PMD, SpotBugs, google-java-format, JaCoCo and Checkstyle), so it
// only runs with NITPICKER_JAVA_E2E=1 (`npm run test:java`). NITPICKER_GRADLE overrides `gradle`.

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const GRADLE_STEP_TIMEOUT_MS = 15 * 60 * 1000;

const LEGACY = `package demo;

public final class Legacy {
  private int leftover;

  public int value() {
    return 1;
  }
}
`;

const LEGACY_MOVED = LEGACY.replace(
  '  private int leftover;',
  '  // Kept for compatibility.\n  // See ticket 12.\n  private int leftover;',
);

const FAREWELL = `package demo;

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

// Empty catch block (PMD), default charset (SpotBugs) and sloppy indentation (formatter).
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

// What Checkstyle's bundled google_checks.xml (the default) reports on Bad.java.
const CHECKSTYLE_PREFIX = 'com.puppycrawl.tools.checkstyle.checks.';
const CHECKSTYLE_ON_BAD = [
  'blocks.EmptyCatchBlockCheck',
  'indentation.IndentationCheck',
  'javadoc.MissingJavadocMethodCheck',
  'javadoc.MissingJavadocMethodCheck',
  'javadoc.MissingJavadocTypeCheck',
  'regexp.RegexpSinglelineJavaCheck',
  'whitespace.EmptyLineSeparatorCheck',
];
// Breaks the ArchitectureTest rule (no use of java.util.Date) from a class and a nested class,
// with otherwise clean code.
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

let repository;
const sourceDirectory = 'src/main/java/demo';

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
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

function branchWith(name, files) {
  git('checkout', '-q', '-b', name, 'main');
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(repository, sourceDirectory, file), content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

describe.skipIf(!enabled)('Java preset end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-e2e-'));
    cpSync(path.resolve(import.meta.dirname, 'fixtures/gradle-project'), repository, {
      recursive: true,
    });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    writeFileSync(path.join(repository, sourceDirectory, 'Legacy.java'), LEGACY);
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base with one legacy violation');
    branchWith('clean', { 'Greeter.java': FAREWELL });
    branchWith('moved', { 'Legacy.java': LEGACY_MOVED });
    branchWith('violation', { 'Bad.java': BAD });
    branchWith('architecture', { 'Stamp.java': STAMP });
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (branch) => {
    git('checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle });
  };

  it(
    'passes a clean change and reports the baselined legacy violations as unchanged',
    () => {
      const result = diffOf('clean');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['pmd UnusedPrivateField Legacy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a violation baselined when its line moves',
    () => {
      const result = diffOf('moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newFindings.filter((finding) => finding.tool !== 'jacoco'))).toEqual(
        [],
      );
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining([
          'pmd UnusedPrivateField Legacy.java',
          'spotbugs UUF_UNUSED_FIELD Legacy.java',
        ]),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails new PMD, SpotBugs, Checkstyle and formatter violations as new',
    () => {
      const result = diffOf('violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...CHECKSTYLE_ON_BAD.map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check} Bad.java`),
        'google-java-format format Bad.java',
        'pmd EmptyCatchBlock Bad.java',
        'spotbugs DM_DEFAULT_ENCODING Bad.java',
      ]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['pmd UnusedPrivateField Legacy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new ArchUnit violation, once per rule and offending class',
    () => {
      const result = diffOf('architecture');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'archunit no_classes_use_legacy_date Stamp.java',
        'archunit no_classes_use_legacy_date Stamp.java',
      ]);
      expect(result.newEnforceable.map((finding) => finding.identity).sort()).toEqual([
        'demo.Stamp',
        'demo.Stamp$Inner',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
